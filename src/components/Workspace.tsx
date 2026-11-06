import { useEffect, useMemo, useRef, useState } from "react";
import { platform } from "@platform";
import type { Card, Library, UserFields } from "../lib/types";
import { effectiveAction, effectiveTags, effectiveTopic } from "../lib/library";
import { buildIndex } from "../lib/search";
import { Grid } from "./Grid";
import { Detail } from "./Detail";
import { Sidebar } from "./Sidebar";
import { Icon } from "./Icon";
import { SortMenu } from "./SortMenu";
import { nextThemePref, setThemePref, THEME_ICONS, THEME_LABELS, useThemePref } from "../lib/theme";
import { T, compareText, formatNumber } from "../i18n";
import { BOARD_TITLE } from "../lib/telegram";
import { actionLabel } from "../lib/types";
import {
  OPEN_MODES,
  SMART_LISTS,
  SORTS,
  TYPES,
  VIEWS,
  loadPref,
  matchesScope,
  matchesType,
  savePref,
  scopeTitle,
  sortCards,
  type OpenMode,
  type Scope,
  type SortKey,
  type TypeKey,
  type ViewKey,
} from "./nav";

export type Job = { label: string; done: number; total: number } | null;

/** The library screen: sidebar, toolbar, board in one of four views, and the card panel. */
export function Workspace(props: {
  lib: Library;
  rev: number;
  job: Job;
  needAi: number;
  aiEnabled: boolean;
  onImport: () => void;
  onExport: (kind: "csv" | "md", cards: Card[]) => void;
  onSettings: () => void;
  /** Desktop only: opens "Send to Telegram". */
  onTelegram?: () => void;
  onRunAi: () => void;
  /** Ask the AI to name one photo from its content (sends that picture). */
  onNameImage?: (card: Card) => void;
  onStop: () => void;
  onEdit: (ids: number[], patch: UserFields) => void;
}) {
  const { lib, rev, onEdit } = props;
  const [scope, setScope] = useState<Scope>({ kind: "list", key: "all" });
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
  const lastClicked = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => savePref("sort", sort), [sort]);
  useEffect(() => savePref("layout", view), [view]);
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

  const listCounts = useMemo(() => {
    const keys = [...SMART_LISTS.map((l) => l.key), "junk", "sensitive"] as const;
    return Object.fromEntries(keys.map((k) => [k, base.filter((c) => matchesScope(c, { kind: "list", key: k })).length]));
  }, [base]);

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

  const inScope = useMemo(() => base.filter((c) => matchesScope(c, scope)), [base, scope]);

  const typeCounts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t.key, inScope.filter((c) => matchesType(c, t.key)).length])) as Record<TypeKey, number>, [inScope]);

  const inType = useMemo(() => inScope.filter((c) => matchesType(c, type)), [inScope, type]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inType) for (const t of effectiveTags(c)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]));
  }, [inType]);

  const visible = useMemo(() => sortCards(tag ? inType.filter((c) => effectiveTags(c).includes(tag)) : inType, sort), [inType, tag, sort]);

  const openIdx = openId == null ? -1 : visible.findIndex((c) => c.id === openId);
  const openCard = openId == null ? null : lib.cards.find((c) => c.id === openId) ?? null;

  function pickScope(s: Scope) {
    setScope(s);
    setTag(null);
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
  const heading = scopeTitle(scope);
  const subtitle = [type && TYPES.find((t) => t.key === type)?.label, tag && `#${tag}`].filter(Boolean).join(" · ");

  return (
    <div className={`workspace${sideOpen ? "" : " side-closed"}${openCard && openMode === "side" ? " with-detail" : ""}`}>
      {sideOpen && (
        <Sidebar
          chatName={lib.chatName}
          scope={scope}
          tag={tag}
          listCounts={listCounts}
          topics={topics}
          noTopic={noTopic}
          tags={tags}
          onScope={pickScope}
          onTag={setTag}
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
          <button className="icon-btn" onClick={props.onImport} title={T.toolbar.import}>
            <Icon name="import" />
          </button>
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

        <div className="subbar">
          {selected.size > 0 ? (
            <div className="selection">
              <b>{T.toolbar.selected(selected.size)}</b>
              <button className="pill" onClick={() => setSelected(new Set(visible.map((c) => c.id)))}>
                {T.toolbar.selectAll(visible.length)}
              </button>
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
              {tag && (
                <button className="pill active" onClick={() => setTag(null)}>
                  #{tag} <Icon name="close" size={12} />
                </button>
              )}
            </div>
          )}
          <div className="spacer" />
          <SortMenu value={sort} onChange={setSort} />
          <div className="segmented" role="radiogroup" aria-label={T.toolbar.view}>
            {VIEWS.map((v) => (
              <button key={v.key} role="radio" aria-checked={view === v.key} className={view === v.key ? "on" : ""} onClick={() => setView(v.key)} title={v.label}>
                <Icon name={v.icon} />
              </button>
            ))}
          </div>
        </div>

        <Grid
          key={`${JSON.stringify(scope)}|${type}|${tag}|${query}|${sort}|${view}`}
          lib={lib}
          cards={visible}
          view={view}
          selected={selected}
          activeId={openId}
          onOpen={(c) => setOpenId(c.id)}
          onToggleSelect={toggleSelect}
          onJunk={toggleJunk}
          onOpenLink={(u) => void platform.openUrl(u)}
        />
      </section>

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
