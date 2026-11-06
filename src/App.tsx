import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import { useUpdateCheck } from "./useUpdateCheck";
import "./App.css";
import type { Card, Library, UserFields } from "./lib/types";
import { makeEdit } from "./lib/library";
import { appendEdit, DEFAULT_SETTINGS, loadBoardState, loadLibrary, loadSettings, saveBoardState, saveLibrary, saveSettings, wipeAll, type Settings } from "./lib/store";
import { BOARD_TITLE, sendToTelegram, TelegramAuthError, telegramErrorText, type SendOptions } from "./lib/telegram";
import { TelegramDialog } from "./components/TelegramDialog";
import { importFolder, pickExportFolder } from "./lib/importer";
import { fetchLinkMeta, needsPreview } from "./lib/linkmeta";
import { AiKeyMissing, aiModelOf, classifyCards, retagCount, nameImages, pendingForAi, pendingImages } from "./lib/ai";
import { toCsv, toMarkdown } from "./lib/exporters";
import { deleteApiKey, getApiKey, setApiKey } from "./lib/secrets";
import { Workspace, type Job } from "./components/Workspace";
import { SettingsDialog } from "./components/Settings";
import { demoLibrary } from "./lib/demo";
import { T, lang, resolveLang, setLang } from "./i18n";
import type { AiLang } from "./lib/ai";

const isWeb = platform.kind === "web";

export default function App() {
  const [lib, setLib] = useState<Library | null>(null);
  const [rev, setRev] = useState(0); // bumps whenever cards change in place
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [sendingTg, setSendingTg] = useState(false);
  const [job, setJob] = useState<Job>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [updating, setUpdating] = useState<number | null | false>(false);
  const updatingRef = useRef(updating);
  updatingRef.current = updating;
  const { update, later: updateLater } = useUpdateCheck(() => updatingRef.current !== false);
  const abortRef = useRef<AbortController | null>(null);
  /** Settings as of now, for AI runs that start right after a save (state updates later). */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [l, s, k] = await Promise.all([loadLibrary(), loadSettings(), getApiKey().catch(() => null)]);
        setLang(resolveLang(s.language));
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
        notify(T.app.loadFailed(String(e)));
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  useEffect(() => {
    platform.appVersion().then(setVersion, () => undefined);
  }, []);

  async function installUpdate() {
    if (!update) return;
    abortRef.current?.abort();
    setUpdating(null);
    try {
      await update.install((p) => setUpdating(p));
    } catch (e) {
      setUpdating(false);
      notify(T.app.updateFailed(String(e)));
    }
  }

  const persist = useCallback(async (l: Library) => {
    try {
      await saveLibrary(l);
    } catch (e) {
      notify(T.app.saveFailed(String(e)));
    }
  }, []);

  /** Default: the interface language, so all topics in the sidebar are in one language. */
  const aiLang = (): AiLang => (settingsRef.current.aiLanguage === "source" ? "source" : lang());

  async function enrichLinks(l: Library, signal: AbortSignal) {
    const todo = l.cards.filter(needsPreview);
    if (!todo.length) return;
    let done = 0;
    setJob({ label: T.app.jobLinks, done, total: todo.length });
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !signal.aborted) {
        const c = todo[next++];
        c.link = await fetchLinkMeta(c.urls[0]);
        done++;
        if (done % 10 === 0 || done === todo.length) {
          setJob({ label: T.app.jobLinks, done, total: todo.length });
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
      notify(T.app.needKeyAi);
      return;
    }
    await runTextAi(key, l, signal);
    if (settingsRef.current.aiImages && !signal.aborted) await runImageAi(key, l, pendingImages(l.cards), signal);
  }

  async function runImageAi(key: string, l: Library, todo: Card[], signal: AbortSignal) {
    if (!todo.length) return;
    setJob({ label: T.app.jobImages, done: 0, total: todo.length });
    try {
      const res = await nameImages(
        key,
        l.cards,
        todo,
        aiLang(),
        aiModelOf(settingsRef.current.aiModel),
        (c) => platform.readMedia(l.sourceDir, c.media!.path!),
        (p) => {
          setJob({ label: T.app.jobImages, done: p.done + p.failed, total: p.total });
          setRev((r) => r + 1);
          void persist(l);
        },
        signal,
      );
      if (res.failed) notify(T.app.imagesFailed(res.failed));
    } catch (e) {
      notify(e instanceof AiKeyMissing ? e.message : T.app.aiError(String(e)));
    }
    await persist(l);
  }

  /** One photo, on the user's request from the card: sends just this picture. */
  async function nameOne(card: Card) {
    if (!lib) return;
    const key = await getApiKey().catch(() => null);
    if (!key) {
      notify(T.app.needKeyImage);
      return;
    }
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const saved = card.ai;
    card.ai = undefined;
    try {
      await runImageAi(key, lib, [card], ctl.signal);
    } finally {
      if (!card.ai) card.ai = saved;
      setJob(null);
      setRev((r) => r + 1);
    }
  }

  async function runTextAi(key: string, l: Library, signal: AbortSignal) {
    const total = pendingForAi(l.cards).length;
    if (!total) return;
    setJob({ label: T.app.jobAi, done: 0, total });
    try {
      const res = await classifyCards(
        key,
        l.cards,
        aiLang(),
        aiModelOf(settingsRef.current.aiModel),
        (p) => {
          setJob({ label: T.app.jobAi, done: p.done + p.failed, total: p.total });
          setRev((r) => r + 1);
          void persist(l);
        },
        signal,
      );
      if (res.failed) notify(T.app.aiFailed(res.failed));
    } catch (e) {
      notify(e instanceof AiKeyMissing ? e.message : T.app.aiError(String(e)));
    }
    await persist(l);
  }

  async function processAll(l: Library) {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      if (settingsRef.current.fetchLinks && platform.canFetchLinks) await enrichLinks(l, ctl.signal);
      if (settingsRef.current.aiEnabled && !ctl.signal.aborted) await runAi(l, ctl.signal);
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
      notify(warning ?? T.app.imported(next.cards.length, added));
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
      for (const id of ids) void appendEdit(makeEdit(id, patch)).catch((e) => notify(T.app.editFailed(String(e))));
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
    notify(T.app.exported(cards.length, path));
  }

  async function sendTelegram(opts: SendOptions) {
    const tg = platform.telegram;
    if (!lib || !tg) return;
    setShowTelegram(false);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setSendingTg(true);
    try {
      const state = await loadBoardState();
      const res = await sendToTelegram(lib.cards, state, opts, {
        tg,
        save: saveBoardState,
        signal: ctl.signal,
        onProgress: (p) => setJob({ label: p.waitSeconds ? T.app.jobTelegramPause(p.waitSeconds) : T.app.jobTelegram, done: p.done, total: p.total }),
      });
      const missing = res.missing ? T.app.tgMissing(res.missing) : "";
      notify(ctl.signal.aborted ? T.app.tgStopped(res.done, res.total) : T.app.tgDone(res.done - res.missing, BOARD_TITLE) + missing);
    } catch (e) {
      notify(telegramErrorText(e));
      if (e instanceof TelegramAuthError) setShowTelegram(true);
    } finally {
      setSendingTg(false);
      setJob(null);
    }
  }

  async function onSaveSettings(s: Settings, key: string | null) {
    await saveSettings(s);
    setLang(resolveLang(s.language));
    settingsRef.current = s;
    setSettings(s);
    if (key) {
      try {
        await setApiKey(key);
        setHasKey(true);
      } catch (e) {
        notify(T.app.keyFailed(String(e)));
      }
    }
    setShowSettings(false);
  }

  /** Saves the settings, then tags every already tagged card again with the chosen model. */
  async function onRetag(s: Settings, key: string | null) {
    await onSaveSettings(s, key);
    if (!lib) return;
    const old = new Map<Card, NonNullable<Card["ai"]>>();
    for (const c of lib.cards) {
      if (!c.ai) continue;
      old.set(c, c.ai);
      c.ai = undefined;
    }
    // Put back what this run won't redo (hidden cards, photos when picture naming is off), so nothing loses its title.
    const redo = new Set([...pendingForAi(lib.cards), ...(s.aiImages ? pendingImages(lib.cards) : [])]);
    for (const [c, ai] of old) if (!redo.has(c)) c.ai = ai;
    setRev((r) => r + 1);
    void processAll(lib);
  }

  async function onWipe() {
    abortRef.current?.abort();
    await wipeAll();
    await deleteApiKey().catch(() => undefined);
    await platform.telegram?.logout().catch(() => undefined);
    setLib(null);
    setHasKey(false);
    setShowSettings(false);
    notify(T.app.wiped);
  }

  if (loading) return <div className="center">{T.common.loading}</div>;

  const needAi = lib ? pendingForAi(lib.cards).length + (settings.aiImages ? pendingImages(lib.cards).length : 0) : 0;
  const settingsDialog = showSettings && <SettingsDialog settings={settings} hasKey={hasKey} version={version} onSave={onSaveSettings} onRetag={onRetag} retagCount={lib ? retagCount(lib.cards) : 0} onWipe={onWipe} onClose={() => setShowSettings(false)} />;

  const banners = (
    <>
      {isWeb && (
        <div className="banner web">
          {T.app.webBanner(version)}
        </div>
      )}
      {update && (
        <div className="banner update">
          {updating === false ? (
            <>
              {T.app.updateAvailable(update.version)}
              <button className="small" onClick={installUpdate}>
                {T.app.updateInstall}
              </button>
              <button className="secondary small" onClick={updateLater}>
                {T.app.updateLater}
              </button>
            </>
          ) : (
            <>{T.app.updateDownloading(updating)}</>
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
        <p>{T.welcome.intro}</p>
        <details className="export-help" open>
          <summary>
            {T.welcome.howTo} <span className="hint">· {T.welcome.howToTime}</span>
          </summary>
          <ol>
            {T.welcome.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
        <div className="welcome-buttons">
          <button onClick={doImport}>{T.welcome.pickFolder}</button>
          {isWeb && (
            <button className="secondary" onClick={openDemo}>
              {T.welcome.demo}
            </button>
          )}
          <button className="secondary" onClick={() => setShowSettings(true)}>
            {T.welcome.settings}
          </button>
        </div>
        {!hasKey && <p className="hint">{T.welcome.noKeyHint}</p>}
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
        onTelegram={platform.telegram ? () => setShowTelegram(true) : undefined}
        onRunAi={() => processAll(lib)}
        onNameImage={settings.aiEnabled && hasKey ? nameOne : undefined}
        onStop={() => abortRef.current?.abort()}
        onEdit={edit}
      />
      {settingsDialog}
      {showTelegram && platform.telegram && (
        <TelegramDialog tg={platform.telegram} cards={lib.cards} running={sendingTg} onStart={sendTelegram} onOpenSettings={() => (setShowTelegram(false), setShowSettings(true))} onClose={() => setShowTelegram(false)} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
