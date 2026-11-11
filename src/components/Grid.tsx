import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNarrow } from "../lib/narrow";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Card, Library } from "../lib/types";
import { CardView } from "./CardView";
import { T } from "../i18n";
import { instantImage } from "../lib/embeds";
import type { CardLook, ViewKey } from "./nav";

const WIDE_GAP = 16;
/** On a phone: two columns with a tighter gap, like a pinboard app. */
const NARROW_GAP = 10;
const NARROW_COL = 150;
const MIN_COL: Record<ViewKey, number> = { masonry: 240, grid: 230, list: 0, headlines: 0 };

function estimate(c: Card, colW: number, view: ViewKey): number {
  if (view === "list") return 104;
  if (view === "headlines") return 44;
  if (view === "grid") return colW * 0.62 + 150;
  const m = c.media;
  if ((c.kind === "photo" || c.kind === "video") && m?.width && m?.height && (m.path || m.thumb)) {
    return Math.min(colW * (m.height / m.width), colW * 1.6) + 80;
  }
  if (c.kind === "link") return (c.preview?.path || c.link?.image || instantImage(c.urls[0]) ? colW * 0.52 : 0) + 130;
  return 100 + Math.min(c.text.length, 320) * 0.45;
}

export type CardHandlers = {
  lib: Library;
  selected: Set<number>;
  activeId: number | null;
  onOpen: (c: Card) => void;
  onToggleSelect: (c: Card, range: boolean) => void;
  onJunk: (c: Card) => void;
  onPin: (c: Card) => void;
  topics: string[];
  onMove: (c: Card, topic: string) => void;
  suggest?: (c: Card) => string | undefined;
  /** Show every card from this channel (a click on the name on a card). */
  onSource?: (name: string) => void;
  onOpenLink: (url: string) => void;
};

/**
 * Virtualized board for all four views. Masonry uses the virtualizer's lanes; the uniform
 * grid virtualizes rows so cards line up; list and headlines are a single column.
 */
export function Grid(props: CardHandlers & { cards: Card[]; view: ViewKey; look?: CardLook; /** Cards that already started their entrance; kept by the parent across searches. */ seen: Set<number>; /** Instead of the usual "nothing here". */ empty?: { title: string; hint: string } }) {
  const { cards, view } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const [outer, setWidth] = useState(1000);
  const narrow = useNarrow();
  const GAP = narrow ? NARROW_GAP : WIDE_GAP;
  const width = outer - 2 * GAP;

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    // Measure before paint, so the first re-flow happens before any card starts its entrance.
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const multi = view === "masonry" || view === "grid";
  const cols = multi ? Math.max(1, Math.floor((width + GAP) / ((narrow ? NARROW_COL : MIN_COL[view]) + GAP))) : 1;
  const colW = (width - GAP * (cols - 1)) / cols;
  const rowMode = view === "grid";
  const count = rowMode ? Math.ceil(cards.length / cols) : cards.length;
  const gap = view === "headlines" ? 0 : view === "list" ? 8 : GAP;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => estimate(cards[rowMode ? i * cols : i], colW, view),
    // The column count is part of the key so a re-flow remounts and re-measures every item.
    getItemKey: (i) => (rowMode ? `${cols}:r${i}` : `${cols}:${cards[i].id}`),
    overscan: 8,
    lanes: view === "masonry" ? cols : 1,
    gap,
    paddingStart: GAP,
    paddingEnd: GAP * 2,
  });

  // Cards rise in only the first time this board shows them (MOTION.md «Masonry»). Opening the
  // side panel narrows the board, the column count changes and every item remounts; without this
  // the whole screen would animate again on each open and close. A card counts as shown once its
  // entrance starts (the first width measurement happens before paint, so that re-flow is over by
  // then). Workspace hands over a fresh set on a section, filter or view change and keeps it while
  // a search is typed, so found cards don't replay on every letter.
  const seen = props.seen;
  // The first screenful rises in one after another (MOTION.md: 50 ms apart); cards scrolled into
  // view later come in without waiting. Short rows get a shorter step so a full screen of
  // headlines still finishes in about half a second.
  const born = useRef(performance.now());
  const step = view === "headlines" ? 20 : view === "list" ? 35 : 50;
  const delayAt = (k: number) => (performance.now() - born.current < 400 ? Math.min(k * step, 600) : 0);

  // Keep the card open in the side panel in view while stepping through with the arrow keys.
  useEffect(() => {
    if (props.activeId == null) return;
    const i = cards.findIndex((c) => c.id === props.activeId);
    if (i >= 0) virtualizer.scrollToIndex(rowMode ? Math.floor(i / cols) : i, { align: "auto" });
  }, [props.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = (c: Card, delay: number) => (
    <CardView
      key={c.id}
      enterDelay={delay}
      enter={!seen.has(c.id)}
      onEntered={() => seen.add(c.id)}
      lib={props.lib}
      card={c}
      view={view}
      look={props.look}
      selected={props.selected.has(c.id)}
      selecting={props.selected.size > 0}
      active={props.activeId === c.id}
      onOpen={() => props.onOpen(c)}
      onToggleSelect={(range) => props.onToggleSelect(c, range)}
      onJunk={() => props.onJunk(c)}
      onPin={() => props.onPin(c)}
      topics={props.topics}
      onMove={(t) => props.onMove(c, t)}
      suggest={props.suggest}
      onSource={props.onSource}
      onOpenLink={props.onOpenLink}
    />
  );

  if (cards.length === 0) {
    return (
      <div className="grid-scroll" ref={parentRef}>
        <div className="empty">
          <b>{props.empty?.title ?? T.grid.emptyTitle}</b>
          <span>{props.empty?.hint ?? T.grid.emptyHint}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid-scroll board-${view}`} ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item, k) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className={rowMode ? "grid-row" : undefined}
            style={{
              position: "absolute",
              top: 0,
              left: GAP + (view === "masonry" ? item.lane * (colW + GAP) : 0),
              width: view === "masonry" ? colW : width,
              transform: `translateY(${item.start}px)`,
              ...(rowMode ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP } : null),
            }}
          >
            {rowMode ? cards.slice(item.index * cols, item.index * cols + cols).map((c) => card(c, delayAt(k))) : card(cards[item.index], delayAt(k))}
          </div>
        ))}
      </div>
    </div>
  );
}
