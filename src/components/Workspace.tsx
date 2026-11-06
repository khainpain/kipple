import { useEffect, useMemo, useRef, useState } from "react";
import { platform } from "@platform";
import type { Card, Library, UserFields } from "../lib/types";
import { effectiveAction, effectiveTags, effectiveTopic, matchesFilter } from "../lib/library";
import { countDuplicateGroups, findDuplicates, groupDuplicates, isImportant } from "../lib/smart";
import { Overview, type OverviewSection } from "./Overview";
import { TidyDialog, type TidyKind } from "./TidyDialog";
import { TopicMenu } from "./TopicMenu";
import { suggestMerges } from "../lib/tidy";
import type { Aliases } from "../lib/library";
import { buildIndex } from "../lib/search";
import { Grid } from "./Grid";
import { Detail } from "./Detail";
import { Sidebar } from "./Sidebar";
import { Icon } from "./Icon";
import { SortMenu } from "./SortMenu";
import { ViewMenu } from "./ViewMenu";
import { nextThemePref, setThemePref, THEME_ICONS, THEME_LABELS, useThemePref } from "../lib/theme";
import { T, compareText, formatNumber } from "../i18n";
import { BOARD_TITLE } from "../lib/telegram";
import type { TelegramAccount } from "../platform/types";
import { actionLabel } from "../lib/types";
import {
  OPEN_MODES,
  SMART_LISTS,
  SORTS,
  TYPES,
  loadPref,
  matchesScope,
  matchesType,
  savePref,
  scopeTitle,
  sortCards,
  type ListKey,
  type OpenMode,
  type Scope,
  type SortKey,
  type TypeKey,
  type ViewKey,
  loadLook,
  saveLook,
  type CardLook,
} from "./nav";

/** Topics smaller than this aren't worth splitting into subgroups. */
const GROUP_MIN = 12;

export type Job = { label: string; done: number; total: number } | null;

/** The library screen: sidebar, toolbar, board in one of four views, and the card panel. */
export function Workspace(props: {
  lib: Library;
  rev: number;
  job: Job;
  needAi: number;
  aiEnabled: boolean;
  /** Undefined in the demo, which can't take a real import. */
  onImport?: () => void;
  onExport: (kind: "csv" | "md", cards: Card[]) => void;
  onSettings: () => void;
  /** Desktop only: opens "Send to Telegram". */
  onTelegram?: () => void;
  /** The signed-in Telegram account, shown at the top of the sidebar. */
  tgAccount?: TelegramAccount | null;
  onRunAi: () => void;
  /** Ask the AI to name one photo from its content (sends that picture). */
  onNameImage?: (card: Card) => void;
  onStop: () => void;
  onEdit: (ids: number[], patch: UserFields) => void;
  /** Merged topics and tags, and saving a change to them. */
  aliases: Aliases;
  onAliases: (a: Aliases) => void;
  /** Ask the AI for synonyms among topic or tag names; undefined when AI can't be used. */
  askSynonyms?: (kind: TidyKind, counts: Map<string, number>) => Promise<Array<{ into: string; from: string[] }>>;
  /** Split a topic into AI subgroups; undefined when AI can't be used. */
  onGroupTopic?: (topic: string) => Promise<void>;
}) {
  const { lib, rev, onEdit } = props;
  const [scope, setScope] = useState<Scope>({ kind: "home" });
  const [type, setType] = useState<TypeKey | null>(null);
  const theme = useThemePref();
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(() => loadPref("sort", SORTS.map((s) => s.key), "new"));
  // Default is the even grid (all cards the same size); a new pref key so earlier saved "masonry" doesn't stick.
  const [view, setView] = useState<ViewKey>(() => loadPref("layout", ["masonry", "grid", "list", "headlines"] as const, "grid"));
  const [sideOpen, setSideOpen] = useState(() => loadPref("sidebar", ["open", "closed"] as const, "open") === "open");
  const [openMode, setOpenMode] = useState<OpenMode>(() => loadPref("open", OPEN_MODES.map((m) => m.key), "center"));
  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [tidy, setTidy] = useState<TidyKind | null>(null);
  const [bulkMoveAt, setBulkMoveAt] = useState<HTMLElement | null>(null);
  /** The open subgroup of the topic, by name, and whether the AI is grouping right now. */
  const [sub, setSub] = useState<string | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const lastClicked = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => savePref("sort", sort), [sort]);
  useEffect(() => savePref("layout", view), [view]);
  const [look, setLook] = useState<CardLook>(loadLook);
  useEffect(() => saveLook(look), [look]);
  useEffect(() => savePref("sidebar", sideOpen ? "open" : "closed"), [sideOpen]);
  useEffect(() => savePref("open", openMode), [openMode]);

  const index = useMemo(() => buildIndex(lib.cards), [lib, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => {
    let list = lib.cards.filter((c) => !c.removed);
    const q = query.trim();
    if (q) {
      const hits = new Set(index.search(q).map((h) => h.id as number));
      list = list.filter((c) => hits.has(c.id));
    }
    return list;
  }, [lib, rev, query, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Possible duplicates among the cards still in play (junk and hidden ones are already dealt with).
  const dupes = useMemo(() => findDuplicates(base.filter((c) => matchesFilter(c, "all"))), [base]);

  const listCounts = useMemo(() => {
    const keys: ListKey[] = [...SMART_LISTS.map((l) => l.key), "junk", "sensitive", "recent", "unsorted", "duplicates"];
    return Object.fromEntries(keys.map((k) => [k, base.filter((c) => matchesScope(c, { kind: "list", key: k }, dupes)).length]));
  }, [base, dupes]);

  const { topics, noTopic } = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const c of base) {
      if (!matchesScope(c, { kind: "list", key: "all" })) continue;
      const t = effectiveTopic(c);
      if (t) m.set(t, (m.get(t) ?? 0) + 1);
      else none++;
    }
    return { topics: [...m.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0])), noTopic: none };
  }, [base]);

  // Searching from the overview searches everything, shown as a board.
  const home = scope.kind === "home" && !query.trim();
  const shown: Scope = scope.kind === "home" && !home ? { kind: "list", key: "all" } : scope;
  const isDupes = shown.kind === "list" && shown.key === "duplicates";

  // Every topic and tag in use (search aside), for tidying up.
  const names = useMemo(() => {
    const topics = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const c of lib.cards) {
      if (c.removed || !matchesFilter(c, "all")) continue;
      const t = effectiveTopic(c);
      if (t) topics.set(t, (topics.get(t) ?? 0) + 1);
      for (const x of effectiveTags(c)) tags.set(x, (tags.get(x) ?? 0) + 1);
    }
    return { topics, tags };
  }, [lib, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const topicNames = useMemo(() => [...names.topics.keys()], [names]);
  const tidyCount = useMemo(() => suggestMerges(names.topics).length + suggestMerges(names.tags).length, [names]);

  const inScope = useMemo(() => base.filter((c) => matchesScope(c, shown, dupes)), [base, JSON.stringify(shown), dupes]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeCounts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t.key, inScope.filter((c) => matchesType(c, t.key)).length])) as Record<TypeKey, number>, [inScope]);

  const inType = useMemo(() => inScope.filter((c) => matchesType(c, type)), [inScope, type]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inType) for (const t of effectiveTags(c)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]));
  }, [inType]);

  // AI subgroups of the open topic, counted among the cards shown now; a group whose cards all left disappears.
  const groups = useMemo(() => {
    if (scope.kind !== "topic") return [];
    const here = new Set(inType.map((c) => c.id));
    return (lib.subgroups?.[scope.name]?.groups ?? []).map((g) => ({ name: g.name, ids: new Set(g.ids.filter((id) => here.has(id))) })).filter((g) => g.ids.size > 0);
  }, [lib, rev, scope, inType]); // eslint-disable-line react-hooks/exhaustive-deps
  const subIds = sub ? groups.find((g) => g.name === sub)?.ids : undefined;

  async function groupTopic() {
    if (scope.kind !== "topic" || !props.onGroupTopic) return;
    setGrouping(true);
    setGroupError(null);
    try {
      await props.onGroupTopic(scope.name);
      setSub(null);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : String(e));
    } finally {
      setGrouping(false);
    }
  }

  const visible = useMemo(() => {
    let list = tag ? inType.filter((c) => effectiveTags(c).includes(tag)) : inType;
    if (subIds) list = list.filter((c) => subIds.has(c.id));
    // Duplicates stay next to each other so the extras are easy to spot.
    return isDupes ? groupDuplicates(list, dupes) : sortCards(list, sort);
  }, [inType, tag, sort, isDupes, dupes, subIds]);

  const sections = useMemo((): OverviewSection[] => {
    if (!home) return [];
    const take = (key: ListKey, order?: (cs: Card[]) => Card[]) => {
      const cs = base.filter((c) => matchesScope(c, { kind: "list", key }, dupes));
      return (order ? order(cs) : cs).slice(0, 8);
    };
    const o = T.overview;
    return [
      {
        key: "unsorted",
        icon: "inbox",
        title: T.nav.unsorted,
        hint: o.unsorted,
        count: listCounts.unsorted,
        cards: take("unsorted"),
      },
      { key: "important", icon: "star", title: T.nav.important, hint: o.important, count: listCounts.important, cards: take("important") },
      { key: "read_later", icon: "clock", title: T.nav.readLater, hint: o.readLater, count: listCounts.read_later, cards: take("read_later") },
      { key: "todo", icon: "check", title: T.nav.todo, hint: o.todo, count: listCounts.todo, cards: take("todo") },
      { key: "recent", icon: "sortNew", title: T.nav.recent, hint: o.recent, count: listCounts.recent, cards: take("recent") },
      {
        key: "duplicates",
        icon: "copy",
        title: T.nav.duplicates,
        hint: o.duplicates(countDuplicateGroups(base, dupes)),
        count: listCounts.duplicates,
        cards: take("duplicates", (cs) => groupDuplicates(cs, dupes)),
      },
    ];
  }, [home, base, dupes, listCounts]);

  const openIdx = openId == null ? -1 : visible.findIndex((c) => c.id === openId);
  const openCard = openId == null ? null : lib.cards.find((c) => c.id === openId) ?? null;

  function pickScope(s: Scope) {
    setScope(s);
    setTag(null);
    setSub(null);
    setGroupError(null);
    setSelected(new Set());
  }

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

  function moveTo(c: Card, topic: string) {
    onEdit([c.id], { topic });
  }

  function togglePin(c: Card) {
    onEdit([c.id], { pinned: !isImportant(c) });
  }

  function toggleJunk(c: Card) {
    const isJunk = effectiveAction(c) === "junk";
    onEdit([c.id], { action: isJunk ? (c.ai?.action && c.ai.action !== "junk" ? c.ai.action : "reference") : "junk" });
  }

  // Keyboard: "/" focuses search, Esc closes the panel or clears the selection, ↑/↓ (or j/k) step through cards.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
      if (e.key === "Escape") {
        if (typing) (el as HTMLInputElement).blur();
        else if (openId != null) setOpenId(null);
        else if (selected.size) setSelected(new Set());
        else if (exportOpen) setExportOpen(false);
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (openId != null && (e.key === "ArrowDown" || e.key === "j") && openIdx < visible.length - 1) {
        e.preventDefault();
        setOpenId(visible[openIdx + 1].id);
      } else if (openId != null && (e.key === "ArrowUp" || e.key === "k") && openIdx > 0) {
        e.preventDefault();
        setOpenId(visible[openIdx - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, openIdx, visible, selected, exportOpen]);

  const exportCards = selected.size ? visible.filter((c) => selected.has(c.id)) : visible;
  const heading = scopeTitle(home ? scope : shown);
  const subtitle = [sub, type && TYPES.find((t) => t.key === type)?.label, tag && `#${tag}`].filter(Boolean).join(" · ");

  return (
    <div className={`workspace${sideOpen ? "" : " side-closed"}${openCard && openMode === "side" ? " with-detail" : ""}`}>
      {sideOpen && (
        <Sidebar
          chatName={lib.chatName}
          account={props.tgAccount}
          scope={scope}
          tag={tag}
          listCounts={listCounts}
          topics={topics}
          noTopic={noTopic}
          tags={tags}
          onScope={pickScope}
          onTag={setTag}
          tidyCount={tidyCount}
          onTidy={() => setTidy("tags")}
        />
      )}

      <section className="content">
        <header className="toolbar">
          <button className="icon-btn" onClick={() => setSideOpen(!sideOpen)} title={sideOpen ? T.toolbar.hideSidebar : T.toolbar.showSidebar}>
            <Icon name="sidebar" />
          </button>
          <div className="heading">
            <h1>{heading}</h1>
            <span className="count">
              {formatNumber(visible.length)}
              {subtitle && <> · {subtitle}</>}
            </span>
          </div>
          <label className="search">
            <Icon name="search" />
            <input ref={searchRef} placeholder={T.toolbar.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query ? (
              <button className="clear" onClick={() => setQuery("")} aria-label={T.toolbar.clear}>
                <Icon name="close" size={14} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>
          <div className="spacer" />
          {props.job ? (
            <span className="job">
              <span className="progress" style={{ "--p": `${Math.round((props.job.done / Math.max(props.job.total, 1)) * 100)}%` } as React.CSSProperties} />
              {props.job.label} {formatNumber(props.job.done)}/{formatNumber(props.job.total)}
              <button className="secondary small-btn" onClick={props.onStop}>
                {T.common.stop}
              </button>
            </span>
          ) : (
            props.needAi > 0 &&
            props.aiEnabled && (
              <button className="secondary small-btn" onClick={props.onRunAi} title={T.toolbar.runAiHint}>
                <Icon name="sparkle" size={14} /> {T.toolbar.runAi(props.needAi)}
              </button>
            )
          )}
          {props.onImport && (
            <button className="icon-btn" onClick={props.onImport} title={T.toolbar.import}>
              <Icon name="import" />
            </button>
          )}
          <div className="menu-wrap">
            <button className="icon-btn" onClick={() => setExportOpen(!exportOpen)} title={T.toolbar.export}>
              <Icon name="export" />
            </button>
            {exportOpen && (
              <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                <small>{selected.size ? T.toolbar.exportSelected(exportCards.length) : T.toolbar.exportAll(exportCards.length)}</small>
                <button onClick={() => (setExportOpen(false), props.onExport("md", exportCards))}>Markdown</button>
                <button onClick={() => (setExportOpen(false), props.onExport("csv", exportCards))}>CSV</button>
              </div>
            )}
          </div>
          {props.onTelegram && (
            <button className="icon-btn" onClick={props.onTelegram} title={T.toolbar.telegram(BOARD_TITLE)}>
              <Icon name="send" />
            </button>
          )}
          <button className="icon-btn" onClick={() => setThemePref(nextThemePref(theme))} title={T.theme.toggle(THEME_LABELS[theme])}>
            <Icon name={THEME_ICONS[theme]} />
          </button>
          <button className="icon-btn" onClick={props.onSettings} title={T.toolbar.settings}>
            <Icon name="settings" />
          </button>
        </header>

        {home ? (
          <Overview
            lib={lib}
            sections={sections}
            topics={topics}
            tidyCount={tidyCount}
            onTidy={() => setTidy(suggestMerges(names.topics).length ? "topics" : "tags")}
            activeId={openId}
            onScope={pickScope}
            onOpen={(c) => setOpenId(c.id)}
            onJunk={toggleJunk}
            onPin={togglePin}
            onMove={moveTo}
            onOpenLink={(u) => void platform.openUrl(u)}
          />
        ) : (
        <>
        <div className="subbar">
          {selected.size > 0 ? (
            <div className="selection">
              <b>{T.toolbar.selected(selected.size)}</b>
              <button className="pill" onClick={() => setSelected(new Set(visible.map((c) => c.id)))}>
                {T.toolbar.selectAll(visible.length)}
              </button>
              <button className="pill" onClick={() => onEdit([...selected], { pinned: true })}>
                <Icon name="star" size={13} /> {T.nav.important}
              </button>
              <button className={`pill${bulkMoveAt ? " active" : ""}`} onClick={(e) => setBulkMoveAt(bulkMoveAt ? null : e.currentTarget)}>
                <Icon name="folder" size={13} /> {T.move.bulk}
              </button>
              {bulkMoveAt && <TopicMenu anchor={bulkMoveAt} topics={topicNames} onPick={(t) => onEdit([...selected], { topic: t })} onClose={() => setBulkMoveAt(null)} />}
              <button className="pill" onClick={() => onEdit([...selected], { action: "read_later" })}>
                {actionLabel("read_later")}
              </button>
              <button className="pill" onClick={() => onEdit([...selected], { action: "idea" })}>
                {actionLabel("idea")}
              </button>
              <button className="pill" onClick={() => (onEdit([...selected], { action: "junk" }), setSelected(new Set()))}>
                {T.toolbar.toJunk}
              </button>
              <button className="pill ghost" onClick={() => setSelected(new Set())}>
                {T.common.cancel}
              </button>
            </div>
          ) : (
            <div className="quick">
              {TYPES.map((t) =>
                typeCounts[t.key] ? (
                  <button key={t.key} className={`pill${type === t.key ? " active" : ""}`} onClick={() => setType(type === t.key ? null : t.key)}>
                    <Icon name={t.icon} size={13} /> {t.label}
                  </button>
                ) : null,
              )}
              {scope.kind === "topic" && (groups.length > 0 || props.onGroupTopic) && <span className="quick-sep" />}
              {groups.map((g) => (
                <button key={g.name} className={`pill${sub === g.name ? " active" : ""}`} onClick={() => setSub(sub === g.name ? null : g.name)}>
                  {g.name} <small>{formatNumber(g.ids.size)}</small>
                </button>
              ))}
              {scope.kind === "topic" && props.onGroupTopic && inScope.length >= GROUP_MIN && (
                <button className="pill ghost" onClick={() => void groupTopic()} disabled={grouping} title={groupError ?? T.groups.hint}>
                  <Icon name="sparkle" size={13} /> {grouping ? T.groups.working : groups.length ? T.groups.redo : T.groups.make}
                </button>
              )}
              {groupError && <span className="quick-error">{groupError}</span>}
              {tag && (
                <button className="pill active" onClick={() => setTag(null)}>
                  #{tag} <Icon name="close" size={12} />
                </button>
              )}
            </div>
          )}
          <div className="spacer" />
          <SortMenu value={sort} onChange={setSort} />
          <ViewMenu view={view} onView={setView} look={look} onLook={setLook} />
        </div>

        <Grid
          key={`${JSON.stringify(shown)}|${sub}|${type}|${tag}|${query}|${sort}|${view}`}
          lib={lib}
          cards={visible}
          view={view}
          look={look}
          selected={selected}
          activeId={openId}
          onOpen={(c) => setOpenId(c.id)}
          onToggleSelect={toggleSelect}
          onJunk={toggleJunk}
          onPin={togglePin}
          topics={topicNames}
          onMove={moveTo}
          onOpenLink={(u) => void platform.openUrl(u)}
        />
        </>
        )}
      </section>

      {tidy && (
        <TidyDialog
          topics={names.topics}
          tags={names.tags}
          aliases={props.aliases}
          initial={tidy}
          askAi={props.askSynonyms}
          onChange={props.onAliases}
          onClose={() => setTidy(null)}
        />
      )}

      {openCard && (
        <Detail
          key={`${openCard.id}:${openCard.ai?.at ?? ""}`}
          lib={lib}
          card={openCard}
          topics={topics.map(([t]) => t)}
          mode={openMode}
          onNameImage={props.onNameImage && openCard.kind === "photo" && !props.job ? () => props.onNameImage!(openCard) : undefined}
          onMode={setOpenMode}
          onClose={() => setOpenId(null)}
          onEdit={(p) => onEdit([openCard.id], p)}
          onPrev={openIdx > 0 ? () => setOpenId(visible[openIdx - 1].id) : undefined}
          onNext={openIdx >= 0 && openIdx < visible.length - 1 ? () => setOpenId(visible[openIdx + 1].id) : undefined}
        />
      )}
    </div>
  );
}
