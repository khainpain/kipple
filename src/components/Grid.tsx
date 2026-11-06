import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Card, Library } from "../lib/types";
import { CardView } from "./CardView";

const MIN_COL = 250;
const GAP = 14;

function estimate(c: Card, colW: number): number {
  const m = c.media;
  if ((c.kind === "photo" || c.kind === "video") && m?.width && m?.height && (m.path || m.thumb)) {
    return Math.min(colW * (m.height / m.width), colW * 1.6) + 80;
  }
  if (c.kind === "link") return (c.link?.image ? colW * 0.52 : 0) + 140;
  return 110 + Math.min(c.text.length, 320) * 0.45;
}

export function Grid(props: {
  lib: Library;
  cards: Card[];
  selected: Set<number>;
  onOpen: (c: Card) => void;
  onToggleSelect: (c: Card, range: boolean) => void;
  onJunk: (c: Card) => void;
}) {
  const { cards } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 2 * GAP));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = Math.max(1, Math.floor((width + GAP) / (MIN_COL + GAP)));
  const colW = (width - GAP * (lanes - 1)) / lanes;

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => estimate(cards[i], colW),
    getItemKey: (i) => cards[i].id,
    overscan: 10,
    lanes,
    gap: GAP,
    paddingStart: GAP,
    paddingEnd: GAP,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [lanes, colW, cards, virtualizer]);

  if (cards.length === 0) {
    return (
      <div className="grid-scroll" ref={parentRef}>
        <div className="empty">Ничего не нашлось. Попробуй другой фильтр или запрос.</div>
      </div>
    );
  }

  return (
    <div className="grid-scroll" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const c = cards[item.index];
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: GAP + item.lane * (colW + GAP),
                width: colW,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <CardView
                lib={props.lib}
                card={c}
                selected={props.selected.has(c.id)}
                onOpen={() => props.onOpen(c)}
                onToggleSelect={(range) => props.onToggleSelect(c, range)}
                onJunk={() => props.onJunk(c)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
