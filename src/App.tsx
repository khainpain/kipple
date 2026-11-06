import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "@platform";
import type { AvailableUpdate } from "./platform/types";
import "./App.css";
import type { Card, Library, UserFields } from "./lib/types";
import { FILTERS, type FilterKey, effectiveTags, effectiveTopic, makeEdit, matchesFilter } from "./lib/library";
import { appendEdit, DEFAULT_SETTINGS, loadLibrary, loadSettings, saveLibrary, saveSettings, wipeAll, type Settings } from "./lib/store";
import { importFolder, pickExportFolder } from "./lib/importer";
import { fetchLinkMeta } from "./lib/linkmeta";
import { AiKeyMissing, classifyCards, pendingForAi } from "./lib/ai";
import { buildIndex } from "./lib/search";
import { toCsv, toMarkdown } from "./lib/exporters";
import { deleteApiKey, getApiKey, setApiKey } from "./lib/secrets";
import { Grid } from "./components/Grid";
import { Detail } from "./components/Detail";
import { SettingsDialog } from "./components/Settings";
import { demoLibrary } from "./lib/demo";

const isWeb = platform.kind === "web";

type Job = { label: string; done: number; total: number } | null;

export default function App() {
  const [lib, setLib] = useState<Library | null>(null);
  const [rev, setRev] = useState(0); // bumps whenever cards change in place
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Card | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [job, setJob] = useState<Job>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [updating, setUpdating] = useState<number | null | false>(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastClicked = useRef<number | null>(null);

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
    const todo = l.cards.filter((c) => c.kind === "link" && c.urls[0] && !c.link && !c.removed);
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

  const index = useMemo(() => (lib ? buildIndex(lib.cards) : null), [lib, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => {
    if (!lib) return [];
    let list = lib.cards.filter((c) => !c.removed);
    if (query.trim() && index) {
      const hits = new Set(index.search(query.trim()).map((h) => h.id as number));
      list = list.filter((c) => hits.has(c.id));
    }
    return list;
  }, [lib, rev, query, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, base.filter((c) => matchesFilter(c, f.key)).length])), [base]);

  const inFilter = useMemo(() => base.filter((c) => matchesFilter(c, filter)), [base, filter]);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inFilter) {
      const t = effectiveTopic(c);
      if (t) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inFilter]);

  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inFilter) if (!topic || effectiveTopic(c) === topic) for (const t of effectiveTags(c)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [inFilter, topic]);

  const visible = useMemo(
    () => inFilter.filter((c) => (!topic || effectiveTopic(c) === topic) && (!tag || effectiveTags(c).includes(tag))),
    [inFilter, topic, tag],
  );

  function toggleSelect(c: Card, range: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (range && lastClicked.current !== null) {
        const a = visible.findIndex((x) => x.id === lastClicked.current);
        const b = visible.findIndex((x) => x.id === c.id);
        if (a >= 0 && b >= 0) for (const x of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x.id);
      } else if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      lastClicked.current = c.id;
      return next;
    });
  }

  async function doExport(kind: "csv" | "md") {
    const cards = selected.size ? visible.filter((c) => selected.has(c.id)) : visible;
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

  const openCard = open && lib ? lib.cards.find((c) => c.id === open.id) ?? null : null;
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
      <header className="toolbar">
        <strong className="brand">Saved Board</strong>
        <input className="search" placeholder="Поиск по тексту, тегам, сайтам…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="spacer" />
        {job ? (
          <span className="job">
            {job.label}: {job.done}/{job.total}
            <button className="secondary small" onClick={() => abortRef.current?.abort()}>
              Стоп
            </button>
          </span>
        ) : (
          needAi > 0 && settings.aiEnabled && (
            <button className="secondary" onClick={() => processAll(lib)} title="Разметить карточки без тем и описаний">
              AI-разметка ({needAi})
            </button>
          )
        )}
        <button className="secondary" onClick={doImport} title="Импортировать новый экспорт: правки и разметка сохранятся">
          Импорт
        </button>
        <button className="secondary" onClick={() => doExport("md")}>
          Markdown
        </button>
        <button className="secondary" onClick={() => doExport("csv")}>
          CSV
        </button>
        <button className="secondary" onClick={() => setShowSettings(true)} aria-label="Настройки">
          ⚙
        </button>
      </header>

      <nav className="filters">
        {FILTERS.map((f) =>
          f.key === "sensitive" && !counts.sensitive ? null : (
            <button key={f.key} className={`chip${filter === f.key ? " active" : ""}`} onClick={() => (setFilter(f.key), setTopic(null), setTag(null))}>
              {f.label} <small>{counts[f.key]}</small>
            </button>
          ),
        )}
        {selected.size > 0 && (
          <span className="selection">
            Выбрано {selected.size}:
            <button className="chip" onClick={() => edit([...selected], { action: "junk" })}>
              В мусор
            </button>
            <button className="chip" onClick={() => edit([...selected], { action: "read_later" })}>
              Прочитать позже
            </button>
            <button className="chip" onClick={() => setSelected(new Set())}>
              Снять выделение
            </button>
          </span>
        )}
      </nav>

      <div className="main">
        <aside className="sidebar">
          <h4>Темы</h4>
          <button className={`side-item${!topic ? " active" : ""}`} onClick={() => (setTopic(null), setTag(null))}>
            Все темы <small>{inFilter.length}</small>
          </button>
          {topics.map(([t, n]) => (
            <button key={t} className={`side-item${topic === t ? " active" : ""}`} onClick={() => (setTopic(t), setTag(null))}>
              {t} <small>{n}</small>
            </button>
          ))}
          {topics.length === 0 && <p className="hint">Темы появятся после AI-разметки.</p>}
          {topTags.length > 0 && (
            <>
              <h4>Теги</h4>
              <div className="tag-cloud">
                {topTags.map(([t, n]) => (
                  <button key={t} className={`chip tag${tag === t ? " active" : ""}`} onClick={() => setTag(tag === t ? null : t)}>
                    #{t} <small>{n}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <Grid
          key={`${filter}|${topic}|${tag}|${query}`}
          lib={lib}
          cards={visible}
          selected={selected}
          onOpen={(c) => setOpen(c)}
          onToggleSelect={toggleSelect}
          onJunk={(c) => edit([c.id], { action: c.user?.action === "junk" || (!c.user?.action && (c.autoJunk || c.ai?.action === "junk")) ? (c.ai?.action && c.ai.action !== "junk" ? c.ai.action : "reference") : "junk" })}
        />
      </div>

      {openCard && <Detail key={openCard.id} lib={lib} card={openCard} onClose={() => setOpen(null)} onEdit={(p) => edit([openCard.id], p)} />}
      {settingsDialog}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
