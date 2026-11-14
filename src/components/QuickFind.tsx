import { useMemo, useState } from "react";
import type { Card } from "../lib/types";
import { effectiveTitle } from "../lib/library";
import { domainOf } from "../lib/rules";
import { quickFind, type buildIndex } from "../lib/search";
import { T } from "../i18n";
import { Icon } from "./Icon";
import { SiteIcon } from "./SiteIcon";
import { KIND_ICON } from "./CardView";
import { useEscape } from "./useEscape";

const LIMIT = 8;

/** Ctrl+K: a search over every card in the middle of the screen; ↑/↓ pick, Enter opens, Esc closes. */
export function QuickFind(props: { cards: Card[]; index: ReturnType<typeof buildIndex>; onOpen: (c: Card) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const found = useMemo(() => quickFind(props.cards, props.index, query, LIMIT), [props.cards, props.index, query]);
  const active = Math.min(at, Math.max(found.length - 1, 0));
  useEscape(props.onClose);

  function open(c: Card | undefined) {
    if (!c) return;
    props.onClose();
    props.onOpen(c);
  }

  return (
    <div className="modal-backdrop quick-backdrop" onClick={props.onClose}>
      <div className="quick-find" role="dialog" aria-modal="true" aria-label={T.quick.label} onClick={(e) => e.stopPropagation()}>
        <label className="quick-input">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            placeholder={T.quick.placeholder}
            aria-label={T.quick.label}
            role="combobox"
            aria-expanded={found.length > 0}
            aria-controls="quick-results"
            aria-activedescendant={found[active] ? `quick-${found[active].id}` : undefined}
            onChange={(e) => (setQuery(e.target.value), setAt(0))}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt(found.length ? (active + 1) % found.length : 0);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt(found.length ? (active - 1 + found.length) % found.length : 0);
              } else if (e.key === "Enter") {
                e.preventDefault();
                open(found[active]);
              }
            }}
          />
        </label>
        {query.trim() !== "" && (
          <ul className="quick-results" id="quick-results" role="listbox" aria-label={T.quick.label}>
            {found.map((c, i) => {
              const sub = (c.kind === "link" ? domainOf(c.urls[0]) : undefined) || c.forwardedFrom;
              return (
                <li key={c.id} id={`quick-${c.id}`} role="option" aria-selected={i === active} className={i === active ? "on" : undefined} onMouseMove={() => i !== active && setAt(i)} onClick={() => open(c)}>
                  <span className="quick-icon">{c.kind === "link" ? <SiteIcon url={c.urls[0]} favicon={c.link?.favicon} size={16} /> : <Icon name={KIND_ICON[c.kind] ?? "file"} size={16} />}</span>
                  <span className="quick-text">
                    <b>{effectiveTitle(c)}</b>
                    {sub && <small>{sub}</small>}
                  </span>
                </li>
              );
            })}
            {found.length === 0 && <li className="quick-empty">{T.quick.empty}</li>}
          </ul>
        )}
        <footer className="quick-keys" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {T.quick.select}
          </span>
          <span>
            <kbd>Enter</kbd> {T.quick.open}
          </span>
          <span className="spacer" />
          <span>
            <kbd>Esc</kbd> {T.quick.close}
          </span>
        </footer>
      </div>
    </div>
  );
}
