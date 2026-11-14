import { useRef } from "react";
import type { Card } from "../lib/types";
import { effectiveTitle } from "../lib/library";
import { T } from "../i18n";
import { Icon } from "./Icon";
import { SiteIcon } from "./SiteIcon";
import { KIND_ICON } from "./CardView";

const SHOWN = 4;

/**
 * Over an open topic: unsorted cards that the person's own sorting points to this topic
 * (lib/suggest.ts, nothing sent anywhere). Each can be added with "+", or all at once.
 */
export function SuggestBanner(props: { cards: Card[]; onAdd: (ids: number[]) => void; onOpen: (c: Card) => void; onHide: () => void }) {
  const ref = useRef<HTMLElement>(null);
  /** The pressed "+" goes away with its row: the focus moves to the next one, or to the board. */
  function add(ids: number[], from: HTMLElement) {
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>("li .icon-btn") ?? [])];
    const at = buttons.indexOf(from);
    props.onAdd(ids);
    requestAnimationFrame(() => {
      const left = [...(ref.current?.querySelectorAll<HTMLElement>("li .icon-btn") ?? [])];
      (left[Math.min(Math.max(at, 0), left.length - 1)] ?? document.querySelector<HTMLElement>(".grid-scroll"))?.focus({ preventScroll: true });
    });
  }
  return (
    <section className="suggest-banner" ref={ref} aria-labelledby="suggest-h">
      <header>
        <Icon name="sparkle" size={14} />
        <span id="suggest-h">{T.suggestHere.title(props.cards.length)}</span>
        <span className="spacer" />
        <button className="link-btn" onClick={(e) => add(props.cards.map((c) => c.id), e.currentTarget)}>
          {T.suggestHere.addAll}
        </button>
        <button className="icon-btn" onClick={props.onHide} title={T.suggestHere.hide} aria-label={T.suggestHere.hide}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <ul>
        {props.cards.slice(0, SHOWN).map((c) => (
          <li key={c.id}>
            <button className="suggest-card" onClick={() => props.onOpen(c)}>
              {c.kind === "link" ? <SiteIcon url={c.urls[0]} favicon={c.link?.favicon} size={16} /> : <Icon name={KIND_ICON[c.kind] ?? "file"} size={16} />}
              <span className="label">{effectiveTitle(c)}</span>
            </button>
            <button className="icon-btn" onClick={(e) => add([c.id], e.currentTarget)} title={T.suggestHere.add} aria-label={`${T.suggestHere.add}: ${effectiveTitle(c)}`}>
              <Icon name="plus" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
