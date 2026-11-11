import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import { useUpdateCheck } from "./useUpdateCheck";
import { useTelegramAccount } from "./useTelegramAccount";
import "./App.css";
import type { Card, Library, UserPatch } from "./lib/types";
import type { Skips, TodayState } from "./lib/today";
import { cleanRules, effectiveTags, effectiveTopic, findTopic, getOwnTopics, makeEdit, matchesFilter, patchUser, restorePrevAi, mergeAlias, NO_ALIASES, NO_RULES, setAliases, setOwnTopics, setTopicRules, topicName, type Aliases, type TopicRules } from "./lib/library";
import { renameInRules, ruleOffer, withoutRulesTo } from "./lib/topicRules";
import { aiAllowed, appendEdits, DEFAULT_SETTINGS, loadBoardState, loadLibrary, loadPendingReplies, loadSettings, saveBoardState, saveLibrary, savePendingReplies, saveSettings, wipeAll, type Settings } from "./lib/store";
import { dueReplies, nextDue, replyText, scheduleReply, withoutReplies, type PendingReply } from "./lib/tgReplies";
import { BOARD_TITLE, sendToTelegram, TelegramAuthError, telegramErrorText, type SendOptions } from "./lib/telegram";
import { TelegramDialog } from "./components/TelegramDialog";
import { importFolder, pickExportFolder } from "./lib/importer";
import { fetchLinkMeta, needsPreview } from "./lib/linkmeta";
import { AiStop, aiModelOf, type AiAuth, classifyCards, retagCount, nameImages, pendingForAi, pendingImages, suggestSynonyms, groupCards } from "./lib/ai";
import { displayTitle } from "./components/CardView";
import { toCsv, toMarkdown } from "./lib/exporters";
import { deleteApiKey, getAiAuth, getApiKey, setApiKey } from "./lib/secrets";
import { Workspace, type Job } from "./components/Workspace";
import { SettingsDialog } from "./components/Settings";
import { NOTICE_EVENT } from "./components/openFile";
import { AiConsentDialog } from "./components/AiConsent";
import { Welcome } from "./components/Welcome";
import { demoLibrary } from "./lib/demo";
import { backupSaved, emptyTelegramLibrary, syncSaved } from "./lib/tgImport";
import { T, lang, resolveLang, setLang } from "./i18n";
import type { AiLang } from "./lib/ai";
import { Toast, type ToastMsg } from "./components/Motion";
import { initTelemetry, markImported, maybeSendPing, setTelemetryEnabled, setTelemetrySuspended, telemetrySupported, track } from "./lib/telemetry";

const isWeb = platform.kind === "web";

/**
 * On the production site visitors only get the demo: import works for real only in the desktop app.
 * Vercel previews (behind Vercel sign-in) and local builds keep the full browser build.
 */
const demoOnly = isWeb && __WEB_DEMO_ONLY__;
/** The early followers' group in Telegram, where the app comes first (same link as the landing). */
const WAITLIST = "https://t.me/+uvCQAMKVznUwNmIy";

export default function App() {
  const [lib, setLib] = useState<Library | null>(null);
  const [rev, setRev] = useState(0); // bumps whenever cards change in place
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const tgAccount = useTelegramAccount(!showTelegram && lib !== null);
  const [sendingTg, setSendingTg] = useState(false);
  const [job, setJob] = useState<Job>(null);
  /** The consent dialog is open; resolving it with the answer carries on with what asked. */
  const [consent, setConsent] = useState<((ok: boolean) => void) | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [version, setVersion] = useState("");
  const [updating, setUpdating] = useState<number | null | false>(false);
  const updatingRef = useRef(updating);
  updatingRef.current = updating;
  const { update, later: updateLater } = useUpdateCheck(() => updatingRef.current !== false);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * The demo is a sealed sandbox: only in memory, never saved, no import, AI or Telegram,
   * so nothing done in it can touch the real library. "Exit demo" goes back to the start.
   */
  const [demo, setDemo] = useState(false);
  /** The library that was just loaded for the first time: the workspace opens the cleanup screen for it. */
  const [cleanupFor, setCleanupFor] = useState<Library | null>(null);
  /** Merges tried out in the demo stay in memory, apart from the real ones in settings. */
  const [demoAliases, setDemoAliases] = useState<Aliases>(NO_ALIASES);
  const [demoTopics, setDemoTopics] = useState<string[]>([]);
  const [demoRules, setDemoRules] = useState<TopicRules>(NO_RULES);
  /** Channels and sites already offered a rule this session, so the offer doesn't nag on every move. */
  const offered = useRef(new Set<string>());
  /** "Three for today" in the demo: in memory only, like its merges. */
  const [demoToday, setDemoToday] = useState<{ today?: TodayState; skips: Skips }>({ skips: {} });
  const demoRef = useRef(demo);
  demoRef.current = demo;
  /** Settings as of now, for AI runs that start right after a save (state updates later). */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const libRef = useRef(lib);
  libRef.current = lib;
  const hasKeyRef = useRef(hasKey);
  hasKeyRef.current = hasKey;

  const notify = useCallback((text: string, action?: ToastMsg["action"]) => {
    const msg: ToastMsg = { text, action };
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), action ? 10000 : 6000);
  }, []);

  // Components deep in the board (opening a card's file) report problems through this event.
  useEffect(() => {
    const on = (e: Event) => notify(String((e as CustomEvent).detail));
    window.addEventListener(NOTICE_EVENT, on);
    return () => window.removeEventListener(NOTICE_EVENT, on);
  }, [notify]);

  // Deletes "Open in Telegram" helper replies from Saved Messages when they're due, while signed in.
  // Every change to the pending list goes through one queue, so a reply added while a cleanup
  // waits on the network isn't overwritten.
  const repliesQueue = useRef<Promise<void>>(Promise.resolve());
  const updateReplies = useCallback((change: (list: PendingReply[]) => PendingReply[]) => {
    const next = repliesQueue.current.then(async () => savePendingReplies(change(await loadPendingReplies())));
    repliesQueue.current = next.catch(() => undefined);
    return next;
  }, []);
  const cleanupTimer = useRef<number | undefined>(undefined);
  const cleanupOn = useRef(false);
  const cleanReplies = useCallback(async () => {
    const tg = platform.telegram;
    if (!tg || !cleanupOn.current) return;
    let failed = false;
    for (const [owner, ids] of dueReplies(await loadPendingReplies(), new Date())) {
      try {
        await tg.deleteSaved(ids, owner);
        await updateReplies((l) => withoutReplies(l, owner, ids));
      } catch (e) {
        // Another account is signed in: its messages have other ids, so these are left alone and
        // dropped from the list. Offline: they stay and the next try deletes them.
        if (/OTHER_ACCOUNT/.test(String(e))) await updateReplies((l) => withoutReplies(l, owner, ids));
        else failed = true;
      }
    }
    if (!cleanupOn.current) return;
    const wait = nextDue(await loadPendingReplies(), new Date());
    window.clearTimeout(cleanupTimer.current);
    if (wait !== null) cleanupTimer.current = window.setTimeout(() => void cleanReplies().catch(() => undefined), failed ? 60_000 : Math.max(wait, 1000));
  }, [updateReplies]);
  useEffect(() => {
    cleanupOn.current = !!tgAccount;
    if (tgAccount) void cleanReplies().catch(() => undefined);
    return () => {
      cleanupOn.current = false;
      window.clearTimeout(cleanupTimer.current);
    };
  }, [tgAccount, cleanReplies]);

  useEffect(() => {
    (async () => {
      try {
        const [l, s, k] = await Promise.all([loadLibrary(), loadSettings(), getApiKey().catch(() => null)]);
        // Links from the landing page: ?lang=en|ru (unless a language was picked in Settings)
        // and ?demo, which opens the sample library straight away in the browser build.
        const q = new URLSearchParams(location.search);
        const qLang = q.get("lang");
        setLang(resolveLang(s.language === "ru" || s.language === "en" ? s.language : qLang === "ru" || qLang === "en" ? qLang : s.language));
        setLib(l);
        setSettings(s);
        setHasKey(!!k);
        void startTelemetry(s, !!l);
        if (demoOnly || (isWeb && q.has("demo"))) {
          history.replaceState(null, "", location.pathname); // "Exit demo" then leads to the normal start
          return openDemo();
        }
        if (!l) return;
        // Libraries imported before previews worked here (or by an older version) catch up in the background.
        const catchUp = () => {
          if (!s.fetchLinks || !platform.canFetchLinks || !l.cards.some(needsPreview)) return;
          const ctl = startJob("previews");
          if (!ctl) return;
          void enrichLinks(l, ctl.signal).finally(() => {
            endJob(ctl);
            setRev((r) => r + 1);
          });
        };
        // Nothing is loaded from Telegram and nothing goes to AI on start: both wait for the user's button.
        catchUp();
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

  /** Anonymous statistics: today's ping on start, then checked every hour and when the window comes back. */
  async function startTelemetry(s: Settings, hadLibrary: boolean) {
    if (!telemetrySupported()) return;
    const firstAfterUpdate = await initTelemetry({
      enabled: s.telemetry,
      hadLibrary,
      context: () => ({
        libraryCount: libRef.current?.cards.length ?? 0,
        ai: aiAllowed(settingsRef.current) ? (hasKeyRef.current ? "own" : "builtin") : "off",
        lang: lang(),
      }),
    });
    if (firstAfterUpdate && s.telemetry) notify(T.app.statsNotice);
    void maybeSendPing();
  }
  useEffect(() => {
    if (!telemetrySupported()) return;
    const send = () => void maybeSendPing();
    const timer = setInterval(send, 3_600_000);
    window.addEventListener("focus", send);
    return () => (clearInterval(timer), window.removeEventListener("focus", send));
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

  // Libraries replaced by "Delete all data" or a new import. A job still unwinding on one of them
  // must not write it back over what replaced it.
  const retired = useRef(new WeakSet<Library>());
  const persist = useCallback(async (l: Library) => {
    if (demoRef.current || retired.current.has(l)) return;
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
    if (!aiAllowed(settingsRef.current) || demoRef.current) return; // nothing leaves without consent
    const auth = await getAiAuth();
    if (!(await runTextAi(auth, l, signal))) return;
    if (settingsRef.current.aiImages && !signal.aborted) await runImageAi(auth, l, pendingImages(l.cards), signal);
  }

  async function runImageAi(auth: AiAuth, l: Library, todo: Card[], signal: AbortSignal) {
    if (!todo.length) return;
    setJob({ label: T.app.jobImages, done: 0, total: todo.length });
    try {
      const res = await nameImages(
        auth,
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
      notify(e instanceof AiStop ? e.message : T.app.aiError(String(e)));
    }
    await persist(l);
  }

  /** Posts a reply quoting the card's message in Saved Messages and opens that chat. */
  async function openInTelegram(card: Card) {
    const tg = platform.telegram;
    if (!tg) return;
    try {
      const sent = await tg.quoteSaved(card.id, replyText());
      const owner = sent.owner;
      // Without the account id the reply can't be matched to its account later, so it stays.
      if (owner !== null) {
        await updateReplies((l) => scheduleReply(l, sent.id, owner, new Date(), settingsRef.current.replyCleanup));
        void cleanReplies().catch(() => undefined);
      }
      // The reply is posted either way; if the chat doesn't open, say where to find it.
      const opened = sent.open ? await platform.openUrl(sent.open).then(() => true, () => false) : false;
      if (!opened) notify(T.telegram.replyNoChat);
    } catch (e) {
      notify(/NO_ORIGINAL/.test(String(e)) ? T.telegram.replyNoOriginal : telegramErrorText(e));
    }
  }

  // One job at a time. Link previews give way to anything the user starts; a job the user started
  // isn't stopped by another button: that one says the app is busy instead.
  const runningJob = useRef<{ kind: "previews" | "work"; ctl: AbortController } | null>(null);
  function jobRunning(): boolean {
    const cur = runningJob.current;
    return !!cur && cur.kind === "work" && !cur.ctl.signal.aborted;
  }
  function startJob(kind: "previews" | "work"): AbortController | null {
    if (jobRunning()) {
      if (kind === "work") notify(T.app.busy);
      return null;
    }
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    runningJob.current = { kind, ctl };
    return ctl;
  }
  /** Clears the progress bar, unless a newer job already owns it. */
  function endJob(ctl: AbortController) {
    if (runningJob.current && runningJob.current.ctl !== ctl) return;
    runningJob.current = null;
    setJob(null);
  }

  async function nameOne(card: Card) {
    if (!lib || !aiAllowed(settingsRef.current)) return;
    const auth = await getAiAuth();
    const ctl = startJob("work");
    if (!ctl) return;
    const saved = card.ai;
    card.ai = undefined;
    try {
      await runImageAi(auth, lib, [card], ctl.signal);
    } finally {
      if (!card.ai) card.ai = saved;
      endJob(ctl);
      setRev((r) => r + 1);
    }
  }

  /** Tags the pending cards; false when the run had to stop (key, allowance), so pictures wait too. */
  async function runTextAi(auth: AiAuth, l: Library, signal: AbortSignal): Promise<boolean> {
    const total = pendingForAi(l.cards).length;
    if (!total) return true;
    setJob({ label: T.app.jobAi, done: 0, total });
    try {
      const res = await classifyCards(
        auth,
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
      track("ai_run_completed", auth.kind);
    } catch (e) {
      notify(e instanceof AiStop ? e.message : T.app.aiError(String(e)));
      if (e instanceof AiStop && (e.message === T.ai.quotaUsed || e.message === T.ai.quotaGlobal)) track("ai_quota_hit");
      if (e instanceof AiStop) {
        await persist(l);
        return false;
      }
    }
    await persist(l);
    return true;
  }

  /** Link previews for new cards, after an import or a load from Telegram. No AI here. */
  async function fetchPreviews(l: Library) {
    const ctl = startJob("previews");
    if (!ctl) return;
    try {
      if (settingsRef.current.fetchLinks && platform.canFetchLinks) await enrichLinks(l, ctl.signal);
    } finally {
      endJob(ctl);
      setRev((r) => r + 1);
    }
  }

  /** The "Tag N" button (and re-tagging from Settings): previews, then AI. Only ever started by the user. */
  async function processAll(l: Library) {
    const ctl = startJob("work");
    if (!ctl) return;
    try {
      if (settingsRef.current.fetchLinks && platform.canFetchLinks) await enrichLinks(l, ctl.signal);
      if (!ctl.signal.aborted && !demoRef.current && !aiAllowed(settingsRef.current) && pendingForAi(l.cards).length) {
        // Pressing the button without consent asks for it; "No AI" is remembered and hides the button.
        setJob(null);
        const ok = await askConsent();
        if (!ok) track("ai_consent_answered", "no"); // "yes" is counted in applySettings
        const s = settingsRef.current;
        await applySettings(ok ? { ...s, aiEnabled: true, aiConsentAt: new Date().toISOString(), aiAsked: true } : { ...s, aiAsked: true });
      }
      if (aiAllowed(settingsRef.current) && !ctl.signal.aborted) await runAi(l, ctl.signal);
    } finally {
      endJob(ctl);
      setRev((r) => r + 1);
    }
  }

  async function doImport() {
    const src = await pickExportFolder();
    if (!src) return;
    try {
      const first = !lib || demoRef.current;
      const { lib: next, added, warning } = await importFolder(src, demoRef.current ? null : lib);
      if (lib) retired.current.add(lib);
      await saveLibrary(next);
      if (first) setCleanupFor(next);
      demoRef.current = false; // before fetchPreviews below, which saves as it goes
      setTelemetrySuspended(false);
      setDemo(false);
      setLib(next);
      setRev((r) => r + 1);
      notify(warning ?? T.app.imported(next.cards.length, added));
      track("import_completed", "export_json");
      markImported();
      void fetchPreviews(next);
    } catch (e) {
      track("import_failed", "export_json");
      notify(e instanceof Error ? e.message : String(e));
    }
  }

  /** Brings the local backup of Saved Messages up to date, quietly, after each load from Telegram. */
  const backupRun = useRef<AbortController | null>(null);
  async function runBackup() {
    const tg = platform.telegram;
    if (!tg || demoRef.current || backupRun.current) return;
    const ctl = new AbortController();
    backupRun.current = ctl;
    try {
      await backupSaved({ tg, signal: ctl.signal });
    } catch {
      // Offline or signed out: the next launch carries on from where it stopped.
    } finally {
      backupRun.current = null;
    }
  }
  useEffect(() => () => backupRun.current?.abort(), []);

  /**
   * Loads Saved Messages straight from Telegram into `l` (a fresh library after sign-in, or the
   * current one to fetch what's new), then downloads photos and link previews. Started only by the
   * user's button; AI waits for its own button. Stopping it keeps what was loaded; the next load carries on.
   */
  async function syncTelegram(l: Library, fresh: boolean) {
    const tg = platform.telegram;
    if (!tg || demoRef.current) return;
    const ctl = startJob("work");
    if (!ctl) return;
    if (fresh) {
      setLib(l);
      setRev((r) => r + 1);
    }
    let added = 0;
    try {
      const res = await syncSaved(l, {
        tg,
        save: persist,
        signal: ctl.signal,
        onProgress: (p) => setJob({ label: p.phase === "messages" ? T.app.jobTgLoad : T.app.jobTgPhotos, done: p.done, total: p.total }),
        onChange: () => setRev((r) => r + 1),
      });
      added = res.added;
      if (fresh || added) notify(T.app.tgLoaded(l.cards.length, added));
      if (fresh && l.cards.length) {
        track("import_completed", "direct");
        markImported();
        if (!ctl.signal.aborted) setCleanupFor(l);
      }
    } catch (e) {
      if (fresh) track("import_failed", "direct");
      notify(T.app.tgLoadFailed(telegramErrorText(e)));
      // Nothing came in on the first load: back to the start, where the export file still works.
      if (fresh && !l.cards.length) setLib(null);
    } finally {
      endJob(ctl);
      setRev((r) => r + 1);
    }
    void runBackup();
    if (ctl.signal.aborted || abortRef.current !== ctl) return;
    if (fresh || added) await fetchPreviews(l);
    else notify(T.app.tgNothingNew);
  }

  async function openDemo() {
    const next = demoLibrary();
    demoRef.current = true;
    setTelemetrySuspended(true);
    setDemo(true);
    setLib(next);
    setRev((r) => r + 1);
  }

  function exitDemo() {
    abortRef.current?.abort();
    demoRef.current = false;
    setTelemetrySuspended(false);
    setDemo(false);
    setLib(null);
  }

  const edit = useCallback(
    (ids: number[], patch: UserPatch) => {
      if (!lib) return;
      const set = new Set(ids);
      for (const c of lib.cards) if (set.has(c.id)) c.user = patchUser(c.user, patch);
      setRev((r) => r + 1);
      if (demoRef.current) return;
      track("item_edited", "tags" in patch ? "tag" : "topic" in patch ? "topic" : "action" in patch ? "status" : "other");
      void appendEdits(ids.map((id) => makeEdit(id, patch))).catch((e) => notify(T.app.editFailed(String(e))));
    },
    [lib, notify],
  );

  /** Moved by hand: offer to send the rest of the channel (or site) to the same topic from now on. */
  const editWithOffer = useCallback(
    (ids: number[], patch: UserPatch) => {
      edit(ids, patch);
      const topic = patch.topic;
      if (!lib || !topic) return;
      const o = ruleOffer(lib.cards, ids, topic);
      if (!o || offered.current.has(`${o.kind}:${o.key}`)) return;
      offered.current.add(`${o.kind}:${o.key}`);
      const name = topicName(topic);
      const wasDemo = demoRef.current;
      notify(o.kind === "channel" ? T.rules.offerChannel(o.key, name, o.count) : T.rules.offerSite(o.key, name, o.count), {
        label: T.rules.always,
        run: () => {
          // Left the demo (or went into it) since the offer: the rule would land in the wrong library.
          if (demoRef.current !== wasDemo) return;
          void addRuleRef.current(o.kind, o.key, topic).then((ok) => ok && notify(T.rules.added));
        },
      });
    },
    [edit, lib, notify],
  );

  async function doExport(kind: "csv" | "md", cards: Card[]) {
    const path = await platform.saveTextFile(
      kind === "csv" ? "kipple.csv" : "kipple.md",
      kind === "csv" ? { name: "CSV", ext: "csv" } : { name: "Markdown", ext: "md" },
      kind === "csv" ? toCsv(cards) : toMarkdown(cards, lib?.chatName),
    );
    if (!path) return;
    track("export_completed", kind);
    notify(T.app.exported(cards.length, path));
  }

  async function sendTelegram(opts: SendOptions) {
    const tg = platform.telegram;
    if (!lib || !tg) return;
    const ctl = startJob("work"); // busy: the dialog stays open with the notice
    if (!ctl) return;
    setShowTelegram(false);
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
      endJob(ctl);
    }
  }

  function askConsent(): Promise<boolean> {
    return new Promise((resolve) => setConsent(() => (ok: boolean) => (setConsent(null), resolve(ok))));
  }

  async function applySettings(s: Settings) {
    if (s.aiConsentAt && !settingsRef.current.aiConsentAt) track("ai_consent_answered", "yes");
    setTelemetryEnabled(s.telemetry);
    await saveSettings(s);
    setLang(resolveLang(s.language));
    settingsRef.current = s;
    setSettings(s);
  }

  async function onSaveSettings(dialog: Settings, key: string | null): Promise<boolean> {
    // The dialog holds a copy from when it opened; what changes elsewhere meanwhile (topics, merges,
    // rules from a toast, today's plan) is taken as it is now, not overwritten by that copy.
    const now = settingsRef.current;
    const s: Settings = { ...dialog, aliases: now.aliases, topics: now.topics, topicRules: now.topicRules, today: now.today, taskSkips: now.taskSkips };
    try {
      await applySettings(s);
    } catch (e) {
      notify(T.app.saveFailed(String(e)));
      return false;
    }
    if (key) {
      try {
        await setApiKey(key);
        setHasKey(true);
      } catch (e) {
        notify(T.app.keyFailed(String(e)));
      }
    }
    setShowSettings(false);
    return true;
  }

  const retagRun = useRef(0);

  /** Saves the settings, then tags every already tagged card again with the chosen model. */
  async function onRetag(s: Settings, key: string | null) {
    if (!(await onSaveSettings(s, key))) return; // don't spend the allowance with settings that didn't save
    if (!lib || demoRef.current) return;
    if (jobRunning()) return void notify(T.app.busy);
    const run = ++retagRun.current;
    // The old fields stay on the card (aiPrev, saved with the library) until new ones arrive.
    for (const c of lib.cards) {
      if (!c.ai) continue;
      c.aiPrev = c.ai;
      c.ai = undefined;
    }
    // Put back what this run won't redo (hidden cards, photos when picture naming is off), so nothing loses its title.
    const redo = new Set([...pendingForAi(lib.cards), ...(s.aiImages ? pendingImages(lib.cards) : [])]);
    for (const c of lib.cards) {
      if (c.aiPrev && !redo.has(c)) {
        c.ai = c.aiPrev;
        delete c.aiPrev;
      }
    }
    setRev((r) => r + 1);
    const l = lib;
    // A stopped run (quota used up, key rejected, Stop) must not leave cards without the title they had.
    void processAll(l).finally(() => {
      if (retagRun.current !== run) return; // a newer re-tag took over these cards
      restorePrevAi(l.cards);
      void persist(l);
      setRev((r) => r + 1);
    });
  }

  /** Back to the built-in key. */
  async function onForgetKey() {
    try {
      await deleteApiKey();
      setHasKey(false);
    } catch (e) {
      notify(T.app.keyFailed(String(e)));
    }
  }

  async function onWipe() {
    abortRef.current?.abort();
    if (lib) retired.current.add(lib);
    try {
      await wipeAll();
      // Settings stay, but what came from the cards goes too: own topic names, merges, today's plan.
      await applySettings({ ...settingsRef.current, aliases: undefined, topics: undefined, today: undefined, taskSkips: undefined });
    } catch (e) {
      notify(T.app.saveFailed(String(e)));
      return;
    }
    await deleteApiKey().catch(() => undefined);
    await platform.telegram?.forgetMedia().catch(() => undefined);
    await platform.telegram?.logout().catch(() => undefined);
    setHasKey(false);
    if (demoOnly) openDemo();
    else {
      setDemo(false);
      setLib(null);
    }
    setShowSettings(false);
    notify(T.app.wiped);
  }

  // Card names are read through the merges (lib/library.ts); set them before anything renders cards.
  const aliases = demo ? demoAliases : (settings.aliases ?? NO_ALIASES);
  setAliases(aliases);
  const ownTopics = demo ? demoTopics : (settings.topics ?? []);
  setOwnTopics(ownTopics);
  setTopicRules(demo ? demoRules : settings.topicRules);

  async function onAliases(a: Aliases) {
    await saveNames({ aliases: a });
  }

  /** Saves merges and the user's own topics: in settings, or only in memory in the demo. */
  /** Returns false when saving failed (the user has been told). */
  async function saveNames(p: { aliases?: Aliases; topics?: string[]; topicRules?: TopicRules }): Promise<boolean> {
    let ok = true;
    if (demoRef.current) {
      if (p.aliases) setDemoAliases(p.aliases);
      if (p.topics) setDemoTopics(p.topics);
      if (p.topicRules) setDemoRules(p.topicRules);
    } else {
      const s = { ...settingsRef.current, ...p };
      settingsRef.current = s;
      setSettings(s);
      try {
        await saveSettings(s);
      } catch (e) {
        notify(T.app.saveFailed(String(e)));
        ok = false;
      }
    }
    if (p.aliases) setAliases(p.aliases);
    if (p.topics) setOwnTopics(p.topics);
    if (p.topicRules) setTopicRules(p.topicRules);
    setRev((r) => r + 1);
    return ok;
  }

  /** Everything from a channel or site goes to a topic (unless a card's topic was picked by hand); "" drops the rule. */
  async function addRule(kind: "channel" | "site", key: string, topic: string): Promise<boolean> {
    const r = rulesNow();
    const field = kind === "channel" ? "channels" : "sites";
    const { [key]: _old, ...rest } = r[field];
    return saveNames({ topicRules: { ...r, [field]: topic ? { ...rest, [key]: topic } : rest } });
  }
  // The offer toast outlives the render that made it; this always reaches the latest rules.
  const addRuleRef = useRef(addRule);
  addRuleRef.current = addRule;

  /** Every topic shown now: the ones on cards and the user's own empty ones. */
  function allTopics(): string[] {
    const names = new Set(getOwnTopics());
    for (const c of lib?.cards ?? []) {
      const t = effectiveTopic(c);
      if (t) names.add(t);
    }
    return [...names];
  }

  /** A new empty topic made by hand. Returns the name it's shown under (an existing one in another case wins). */
  async function createTopic(raw: string): Promise<string> {
    const name = raw.trim().slice(0, 40);
    const same = findTopic(allTopics(), name);
    if (same) return same;
    // The name was merged away earlier: making it again by hand undoes that merge.
    let a = aliasesNow();
    if (Object.prototype.hasOwnProperty.call(a.topics, name)) {
      const { [name]: _gone, ...rest } = a.topics;
      a = { ...a, topics: rest };
    }
    await saveNames({ aliases: a, topics: [...ownTopicsNow(), name] });
    return name;
  }

  /** Renames a topic for every card in it, now and later (the AI's own name points at the new one). */
  async function renameTopic(from: string, raw: string): Promise<string> {
    const to = findTopic(allTopics().filter((t) => t !== from), raw) ?? raw.trim().slice(0, 40);
    if (!to || to === from) return from;
    const a = aliasesNow();
    const used = lib?.cards.some((c) => effectiveTopic(c) === from);
    const own = ownTopicsNow().filter((t) => topicName(t) !== from && topicName(t) !== to);
    if (lib?.subgroups?.[from]) {
      const { [from]: groups, ...rest } = lib.subgroups;
      lib.subgroups = rest[to] ? rest : { ...rest, [to]: groups };
      void persist(lib);
    }
    await saveNames({ aliases: used ? { ...a, topics: mergeAlias(a.topics, [from], to) } : a, topics: [...own, to], topicRules: renameInRules(rulesNow(), from, to) });
    return to;
  }

  /** Deletes a topic: its cards are left without one, and the AI won't be offered the name again. */
  async function deleteTopic(name: string) {
    if (!lib) return;
    const ids = lib.cards.filter((c) => effectiveTopic(c) === name).map((c) => c.id);
    if (ids.length) edit(ids, { topic: "" });
    if (lib.subgroups?.[name]) {
      const { [name]: _gone, ...rest } = lib.subgroups;
      lib.subgroups = rest;
      void persist(lib);
    }
    await saveNames({ topics: ownTopicsNow().filter((t) => topicName(t) !== name), topicRules: withoutRulesTo(rulesNow(), name) });
  }

  /** Saves today's plan and the tasks set aside: in settings, or only in memory in the demo. */
  async function saveToday(p: { today?: TodayState; skips?: Skips }) {
    if (demoRef.current) {
      setDemoToday((d) => ({ today: p.today ?? d.today, skips: p.skips ?? d.skips }));
      return;
    }
    const s = { ...settingsRef.current, ...(p.today && { today: p.today }), ...(p.skips && { taskSkips: p.skips }) };
    settingsRef.current = s;
    setSettings(s);
    try {
      await saveSettings(s);
    } catch (e) {
      notify(T.app.saveFailed(String(e)));
    }
  }

  const aliasesNow = () => (demoRef.current ? demoAliases : (settingsRef.current.aliases ?? NO_ALIASES));
  const ownTopicsNow = () => (demoRef.current ? demoTopics : (settingsRef.current.topics ?? []));
  const rulesNow = () => (demoRef.current ? demoRules : cleanRules(settingsRef.current.topicRules));

  async function askSynonyms(kind: "topics" | "tags", counts: Map<string, number>) {
    if (!aiAllowed(settingsRef.current) || demoRef.current) return []; // nothing leaves without consent
    try {
      return await suggestSynonyms(await getAiAuth(), aiModelOf(settingsRef.current.aiModel), kind, counts);
    } catch (e) {
      throw new Error(e instanceof AiStop ? e.message : T.app.aiError(String(e)));
    }
  }

  /** Splits one topic into AI subgroups and keeps them in the library. Errors come back as readable messages. */
  async function groupTopic(topic: string) {
    if (!lib || !aiAllowed(settingsRef.current) || demoRef.current) return; // nothing leaves without consent
    const cards = lib.cards.filter((c) => !c.removed && matchesFilter(c, "all") && effectiveTopic(c) === topic);
    try {
      const groups = await groupCards(await getAiAuth(), aiModelOf(settingsRef.current.aiModel), aiLang(), topic, cards, displayTitle, effectiveTags);
      lib.subgroups = { ...lib.subgroups, [topic]: { at: new Date().toISOString(), groups } };
      await persist(lib);
      setRev((r) => r + 1);
    } catch (e) {
      throw new Error(e instanceof AiStop ? e.message : T.app.aiError(String(e)));
    }
  }

  if (loading) return <div className="center">{T.common.loading}</div>;

  const needAi = lib ? pendingForAi(lib.cards).length + (settings.aiImages ? pendingImages(lib.cards).length : 0) : 0;
  const settingsDialog = showSettings && <SettingsDialog settings={settings} rules={demo ? demoRules : (settings.topicRules ?? NO_RULES)} onRemoveRule={(kind, key) => void addRule(kind, key, "")} hasKey={hasKey} version={version} onSave={onSaveSettings} onRetag={onRetag} retagCount={lib && !demo ? retagCount(lib.cards) : 0} onWipe={onWipe} onForgetKey={onForgetKey} onClose={() => setShowSettings(false)} />;

  const consentDialog = consent && <AiConsentDialog hasKey={hasKey} onAllow={() => consent(true)} onDecline={() => consent(false)} />;

  const banners = (
    <>
      {demoOnly && (
        <div className="banner demo">
          <span className="wide-only">{__WEB_DOWNLOAD__ ? T.app.webDemoBanner : T.app.webDemoBannerWaitlist}</span>
          <span className="narrow-only">{T.app.webDemoBannerShort}</span>
          {__WEB_DOWNLOAD__ ? (
            <a className="banner-link" href="/download">
              {T.app.webDemoDownload}
            </a>
          ) : (
            <a className="banner-link" href={WAITLIST} target="_blank" rel="noopener noreferrer">
              {T.app.webDemoWaitlist}
            </a>
          )}
        </div>
      )}
      {isWeb && !demoOnly && (
        <div className="banner web">
          {T.app.webBanner(version)}
        </div>
      )}
      {demo && !demoOnly && (
        <div className="banner demo">
          {T.app.demoBanner}
          <button className="small" onClick={exitDemo}>
            {T.app.demoExit}
          </button>
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
      <Welcome
        tg={platform.telegram}
        showDemo
        onImport={doImport}
        onLoadSaved={() => void syncTelegram(emptyTelegramLibrary(), true)}
        onDemo={openDemo}
        telemetry={telemetrySupported() ? settings.telemetry : undefined}
        onTelemetry={(on) => void applySettings({ ...settingsRef.current, telemetry: on })}
        onSettings={() => setShowSettings(true)}
        onLanguage={(l) => void onSaveSettings({ ...settingsRef.current, language: l }, null)}
        openUrl={(u) => void platform.openUrl(u)}
        top={banners}
      >
        {settingsDialog}
        {consentDialog}
        <Toast text={toast?.text ?? null} action={toast?.action} onClose={() => setToast(null)} />
      </Welcome>
    );
  }

  return (
    <div className="app">
      {banners}
      <Workspace
        // The demo and the person's own library never share what the workspace remembers (filters, cleanup undo).
        key={demo ? "demo" : "own"}
        lib={lib}
        rev={rev}
        tgAccount={tgAccount}
        job={job}
        needAi={demo ? 0 : needAi}
        offerAi={aiAllowed(settings) || !settings.aiAsked}
        onImport={demo ? undefined : doImport}
        onExport={doExport}
        onSettings={() => setShowSettings(true)}
        onTelegram={platform.telegram && !demo ? () => setShowTelegram(true) : undefined}
        onLoadTelegram={tgAccount && !demo ? () => void syncTelegram(lib, false) : undefined}
        onRunAi={() => processAll(lib)}
        onNameImage={aiAllowed(settings) && !demo ? nameOne : undefined}
        onOpenInTelegram={tgAccount && !demo ? openInTelegram : undefined}
        onStop={() => abortRef.current?.abort()}
        onEdit={editWithOffer}
        onRule={(kind, key, topic) => void addRule(kind, key, topic)}
        aliases={aliases}
        onAliases={onAliases}
        askSynonyms={aiAllowed(settings) && !demo ? askSynonyms : undefined}
        onGroupTopic={aiAllowed(settings) && !demo ? groupTopic : undefined}
        onCreateTopic={createTopic}
        onRenameTopic={renameTopic}
        onDeleteTopic={deleteTopic}
        today={demo ? demoToday.today : settings.today}
        taskSkips={demo ? demoToday.skips : (settings.taskSkips ?? {})}
        onToday={saveToday}
        firstCleanup={cleanupFor === lib}
      />
      {settingsDialog}
      {consentDialog}
      {showTelegram && platform.telegram && (
        <TelegramDialog tg={platform.telegram} cards={lib.cards} running={sendingTg} onStart={sendTelegram} onOpenSettings={() => (setShowTelegram(false), setShowSettings(true))} onClose={() => setShowTelegram(false)} />
      )}
      <Toast text={toast?.text ?? null} action={toast?.action} onClose={() => setToast(null)} />
    </div>
  );
}
