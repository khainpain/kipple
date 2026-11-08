import { useEffect, useRef, useState } from "react";
import type { Action } from "../lib/types";
import { ACTIONS, actionLabel } from "../lib/types";
import { T } from "../i18n";
import { Icon } from "./Icon";

/**
 * Compact editors for the card's own settings (status, tags, note), laid out as
 * Notion-style property rows: a small label on the left, the value on the right,
 * so the message stays the main thing in the card.
 */

export function PropRow(props: { icon: string; label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="prop-row">
      <span className="prop-label" id={props.id}>
        <Icon name={props.icon} size={14} />
        {props.label}
      </span>
      <div className="prop-value">{props.children}</div>
    </div>
  );
}

/** The status as one coloured chip; a click opens the list of statuses. */
export function StatusChip(props: { value?: Action; labelledBy?: string; onChange: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    items.current[Math.max(0, ACTIONS.indexOf(props.value as Action))]?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setOpen(false);
    btn.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    const n = ACTIONS.length;
    const i = items.current.findIndex((el) => el === document.activeElement);
    const focus = (j: number) => {
      e.preventDefault();
      items.current[(j + n) % n]?.focus();
    };
    // Keep the arrows and Esc from also stepping through or closing the card.
    e.stopPropagation();
    if (e.key === "Escape") (e.preventDefault(), close());
    else if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") focus(i - 1);
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="menu-wrap" ref={wrap} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className={`pill status-chip${props.value ? ` action-${props.value} on` : " ghost"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={props.labelledBy}
        onClick={() => setOpen(!open)}
      >
        {props.value ? actionLabel(props.value) : T.detail.noStatus}
        <Icon name="down" size={11} className="chev" />
      </button>
      {open && (
        <div className="menu status-menu" role="listbox" aria-labelledby={props.labelledBy}>
          {ACTIONS.map((a, i) => (
            <button
              key={a}
              type="button"
              role="option"
              aria-selected={a === props.value}
              ref={(el) => {
                items.current[i] = el;
              }}
              onClick={() => {
                if (a !== props.value) props.onChange(a);
                close();
              }}
            >
              <span className={`status-dot action-${a}`} />
              <span className="label">{actionLabel(a)}</span>
              {a === props.value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const cleanTag = (s: string) => s.trim().replace(/^#+/, "").toLowerCase();

/** Tags as chips: × on a chip removes it, "+" opens a small input (Enter or comma adds). */
export function TagsEditor(props: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const fresh = raw.split(",").map(cleanTag).filter((t) => t && !props.tags.includes(t));
    if (fresh.length) props.onChange([...props.tags, ...new Set(fresh)]);
    setDraft("");
  }

  return (
    <div className="tag-chips">
      {props.tags.map((t) => (
        <span key={t} className="tag-chip">
          #{t}
          <button type="button" className="tag-x" title={T.detail.removeTag(t)} aria-label={T.detail.removeTag(t)} onClick={() => props.onChange(props.tags.filter((x) => x !== t))}>
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          className="tag-input"
          autoFocus
          value={draft}
          placeholder={T.detail.tagPlaceholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onBlur={() => {
            add(draft);
            setAdding(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.preventDefault(), add(draft));
            else if (e.key === "Escape") (e.preventDefault(), setDraft(""), setAdding(false));
            else if (e.key === "Backspace" && !draft && props.tags.length) props.onChange(props.tags.slice(0, -1));
          }}
        />
      ) : (
        <button type="button" className="prop-add" onClick={() => setAdding(true)} title={T.detail.addTag}>
          <Icon name="plus" size={13} />
          {props.tags.length ? null : T.detail.addTag}
        </button>
      )}
    </div>
  );
}

/** The note stays a one-line "Add a note" until there is something in it. */
export function NoteField(props: { value: string; onChange: (v: string) => void; onSave: () => void; labelledBy?: string }) {
  const [editing, setEditing] = useState(false);
  if (!props.value && !editing)
    return (
      <button type="button" className="prop-add" onClick={() => setEditing(true)}>
        {T.detail.addNote}
      </button>
    );
  return (
    <textarea
      className="prop-note"
      rows={1}
      autoFocus={editing}
      value={props.value}
      placeholder={T.detail.notePlaceholder}
      aria-labelledby={props.labelledBy}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation(); // the board's keys (j/k, /) are text here
        if (e.key === "Escape") e.currentTarget.blur(); // saves; a second Esc closes the card, as in the title
      }}
      onBlur={() => {
        setEditing(false);
        props.onSave();
      }}
    />
  );
}
