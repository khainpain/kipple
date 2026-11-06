import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import type { AvailableUpdate } from "./platform/types";
import "./App.css";
import type { Card, Library, UserFields } from "./lib/types";
import { makeEdit } from "./lib/library";
import { appendEdit, DEFAULT_SETTINGS, loadLibrary, loadSettings, saveLibrary, saveSettings, wipeAll, type Settings } from "./lib/store";
import { importFolder, pickExportFolder } from "./lib/importer";
import { fetchLinkMeta, needsPreview } from "./lib/linkmeta";
import { AiKeyMissing, classifyCards, pendingForAi } from "./lib/ai";
import { toCsv, toMarkdown } from "./lib/exporters";
import { deleteApiKey, getApiKey, setApiKey } from "./lib/secrets";
import { Workspace, type Job } from "./components/Workspace";
import { SettingsDialog } from "./components/Settings";
import { demoLibrary } from "./lib/demo";

const isWeb = platform.kind === "web";

export default function App() {
  const [lib, setLib] = useState<Library | null>(null);
  const [rev, setRev] = useState(0); // bumps whenever cards change in place
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [job, setJob] = useState<Job>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [updating, setUpdating] = useState<number | null | false>(false);
  const abortRef = useRef<AbortController | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [l, s, k] = await Promise.all([loadLibrary(), loadSettings(), getApiKey().catch(() => null)]);
        setLib(l);
        setSettings(s);
        setHasKey(!!k);
        // Libraries imported before previews worked here (or by an older version) catch up in the background.
        if (l && s.fetchLinks && platform.canFetchLinks && l.cards.some(needsPreview)) {
          const ctl = new AbortController();
          abortRef.current = ctl;
          void enrichLinks(l, ctl.signal).finally(() => {
            setJob(null);
            setRev((r) => r + 1);
          });
        }
      } catch (e) {
        notify(`Не удалось загрузить библиотеку: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  useEffect(() => {
    platform.appVersion().then(setVersion, () => undefined);
    // Desktop only: a new release on GitHub shows a banner; installing it restarts the app.
    platform.checkUpdate().then(setUpdate, (e) => console.warn("update check failed", e));
  }, []);

  async function installUpdate() {
    if (!update) return;
    abortRef.current?.abort();
    setUpdating(null);
    try {
      await update.install((p) => setUpdating(p));
    } catch (e) {
      setUpdating(false);
      notify(`Не удалось обновиться: ${e}`);
    }
  }

  const persist = useCallback(async (l: Library) => {
    try {
      await saveLibrary(l);
    } catch (e) {
      notify(`Не удалось сохранить: ${e}`);
    }
  }, []);

  async function enrichLinks(l: Library, signal: AbortSignal) {
    const todo = l.cards.filter(needsPreview);
    if (!todo.length) return;
    let done = 0;
    setJob({ label: "Превью ссылок", done, total: todo.length });
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !signal.aborted) {
        const c = todo[next++];
        c.link = await fetchLinkMeta(c.urls[0]);
        done++;
        if (done % 10 === 0 || done === todo.length) {
          setJob({ label: "Превью ссылок", done, total: todo.length });
          setRev((r) => r + 1);
        }
        if (done % 50 === 0) await persist(l);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await persist(l);
  }

  async function runAi(l: Library, signal: AbortSignal) {
    const key = await getApiKey().catch(() => null);
    if (!key) {
      notify("Добавь ключ Anthropic в настройках, чтобы включить AI-разметку.");
      return;
    }
    const total = pendingForAi(l.cards).length;
    if (!total) return;
    setJob({ label: "AI-разметка", done: 0, total });
    try {
      const res = await classifyCards(
        key,
        l.cards,
        (p) => {
          setJob({ label: "AI-разметка", done: p.done + p.failed, total: p.total });
          setRev((r) => r + 1);
          void persist(l);
        },
        signal,
      );
      if (res.failed) notify(`AI не смог разметить ${res.failed} карточек, можно запустить ещё раз.`);
    } catch (e) {
      notify(e instanceof AiKeyMissing ? e.message : `Ошибка AI: ${e}`);
    }
    await persist(l);
  }

  async function processAll(l: Library) {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      if (settings.fetchLinks && platform.canFetchLinks) await enrichLinks(l, ctl.signal);
      if (settings.aiEnabled && !ctl.signal.aborted) await runAi(l, ctl.signal);
    } finally {
      setJob(null);
      setRev((r) => r + 1);
    }
  }

  async function doImport() {
    const src = await pickExportFolder();
    if (!src) return;
    try {
      const { lib: next, added, warning } = await importFolder(src, lib);
      await saveLibrary(next);
      setLib(next);
      setRev((r) => r + 1);
      notify(warning ?? `Импорт готов: ${next.cards.length} карточек, новых ${added}.`);
      void processAll(next);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  }

  async function openDemo() {
    const next = demoLibrary();
    await saveLibrary(next);
    setLib(next);
    setRev((r) => r + 1);
  }

  const edit = useCallback(
    (ids: number[], patch: UserFields) => {
      if (!lib) return;
      const set = new Set(ids);
      for (const c of lib.cards) if (set.has(c.id)) c.user = { ...c.user, ...patch };
      setRev((r) => r + 1);
      for (const id of ids) void appendEdit(makeEdit(id, patch)).catch((e) => notify(`Правка не сохранилась: ${e}`));
    },
    [lib, notify],
  );

  async function doExport(kind: "csv" | "md", cards: Card[]) {
    const path = await platform.saveTextFile(
      kind === "csv" ? "saved-board.csv" : "saved-board.md",
      kind === "csv" ? { name: "CSV", ext: "csv" } : { name: "Markdown", ext: "md" },
      kind === "csv" ? toCsv(cards) : toMarkdown(cards, lib?.chatName),
    );
    if (!path) return;
    notify(`Сохранено ${cards.length} карточек в ${path}`);
  }

  async function onSaveSettings(s: Settings, key: string | null) {
    await saveSettings(s);
    setSettings(s);
    if (key) {
      try {
        await setApiKey(key);
        setHasKey(true);
      } catch (e) {
        notify(`Не удалось сохранить ключ: ${e}`);
      }
    }
    setShowSettings(false);
  }

  async function onWipe() {
    abortRef.current?.abort();
    await wipeAll();
    await deleteApiKey().catch(() => undefined);
    setLib(null);
    setHasKey(false);
    setShowSettings(false);
    notify("Все данные удалены с этого компьютера.");
  }

  if (loading) return <div className="center">Загрузка…</div>;

  const needAi = lib ? pendingForAi(lib.cards).length : 0;
  const settingsDialog = showSettings && <SettingsDialog settings={settings} hasKey={hasKey} version={version} onSave={onSaveSettings} onWipe={onWipe} onClose={() => setShowSettings(false)} />;

  const banners = (
    <>
      {isWeb && (
        <div className="banner web">
          Веб-версия для проверки интерфейса{version ? ` (${version})` : ""}. Данные хранятся только в этом браузере, превью ссылок не загружаются, фото видны до перезагрузки страницы.
        </div>
      )}
      {update && (
        <div className="banner update">
          {updating === false ? (
            <>
              Доступна версия {update.version}.
              <button className="small" onClick={installUpdate}>
                Обновить и перезапустить
              </button>
              <button className="secondary small" onClick={() => setUpdate(null)}>
                Позже
              </button>
            </>
          ) : (
            <>Скачиваю обновление{updating !== null ? ` ${updating}%` : ""}…</>
          )}
        </div>
      )}
    </>
  );

  if (!lib) {
    return (
      <div className="welcome">
        {banners}
        <h1>Saved Board</h1>
        <p>Превращает «Избранное» Telegram в визуальную библиотеку с темами, тегами и поиском. Всё хранится на этом компьютере.</p>
        <ol>
          <li>Открой Telegram Desktop → «Избранное» → ⋮ → «Экспорт истории чата».</li>
          <li>Формат: <b>JSON</b>. Отметь «Фотографии» (видео и файлы — по желанию, с ограничением размера).</li>
          <li>Дождись окончания экспорта и выбери получившуюся папку (в ней лежит <code>result.json</code>).</li>
        </ol>
        <div className="welcome-buttons">
          <button onClick={doImport}>Выбрать папку экспорта</button>
          {isWeb && (
            <button className="secondary" onClick={openDemo}>
              Открыть демо
            </button>
          )}
          <button className="secondary" onClick={() => setShowSettings(true)}>
            Настройки и ключ AI
          </button>
        </div>
        {!hasKey && <p className="hint">Без ключа Anthropic будут работать сетка, фильтры по типу и поиск; темы и описания появятся, когда добавишь ключ.</p>}
        {settingsDialog}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      {banners}
      <Workspace
        lib={lib}
        rev={rev}
        job={job}
        needAi={needAi}
        aiEnabled={settings.aiEnabled}
        onImport={doImport}
        onExport={doExport}
        onSettings={() => setShowSettings(true)}
        onRunAi={() => processAll(lib)}
        onStop={() => abortRef.current?.abort()}
        onEdit={edit}
      />
      {settingsDialog}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
