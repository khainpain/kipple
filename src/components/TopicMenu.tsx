import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, compareText } from "../i18n";
import { Icon } from "./Icon";
import { hueOf } from "./nav";

const WIDTH = 240;

/**
 * "Move to topic": a small popover next to the button that opened it, with a filter that
 * doubles as "create a new topic". Rendered in a portal so a card's rounded clipping
 * doesn't cut it; closes on a click outside, Esc or scrolling the board.
 */
export function TopicMenu(props: {
  anchor: HTMLElement;
  topics: string[];
  /** The topic the card is in now (single card only). */
  current?: string;
  /** "" takes the topic away. */
  onPick: (topic: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean }>({ left: 0, top: 0, up: false });
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const r = props.anchor.getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight && r.top > 320;
    setPos({ left: Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8)), top: up ? r.top - 6 : r.bottom + 6, up });
  }, [props.anchor]);

  useEffect(() => {
    input.current?.focus();
    const close = () => props.onClose();
    // Scrolling the board would leave the menu floating away from its card. Scrolling the
    // menu's own list of topics is the menu working, not the board moving.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && box.current?.contains(e.target))) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = q.trim();
  const lower = name.toLocaleLowerCase();
  const list = props.topics.filter((t) => !lower || t.toLocaleLowerCase().includes(lower)).sort((a, b) => (lower ? Number(!a.toLocaleLowerCase().startsWith(lower)) - Number(!b.toLocaleLowerCase().startsWith(lower)) : 0) || compareText(a, b));
  const exact = props.topics.find((t) => t.toLocaleLowerCase() === lower);

  function pick(t: string) {
    props.onPick(t);
    props.onClose();
  }

  return createPortal(
    <div className="popover-backdrop" onMouseDown={props.onClose} onClick={(e) => e.stopPropagation()}>
      <div
        ref={box}
        className={`menu topic-menu${pos.up ? " up" : ""}`}
        style={{ left: pos.left, top: pos.top, width: WIDTH }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") props.onClose();
        }}
      >
        <input
          ref={input}
          value={q}
          placeholder={T.move.filter}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !name) return;
            e.preventDefault();
            pick(exact ?? list[0] ?? name);
          }}
        />
        <div className="topic-menu-list">
          {list.map((t) => (
            <button key={t} onClick={() => pick(t)} className={t === props.current ? "on" : undefined}>
              <span className="topic-dot" style={{ "--h": hueOf(t) } as React.CSSProperties} />
              <span className="label">{t}</span>
              {t === props.current && <Icon name="check" size={14} />}
            </button>
          ))}
          {name && !exact && (
            <button onClick={() => pick(name)}>
              <Icon name="plus" size={14} />
              <span className="label">{T.move.create(name)}</span>
            </button>
          )}
        </div>
        {props.current && !name && (
          <button className="topic-menu-clear" onClick={() => pick("")}>
            <Icon name="close" size={14} />
            <span className="label">{T.move.clear}</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
