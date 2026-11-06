import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export type SelectOption<V extends string> = { value: V; label: string };

/**
 * App-styled replacement for a native <select>: a field-looking button and a dropdown in
 * the same look as the other menus. Keyboard: ↑/↓/Home/End move, Enter/Space pick,
 * Esc or Tab close, typing a letter jumps to the next option starting with it.
 */
export function Select<V extends string>(props: {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  /** Id of the element that names the field (for aria-labelledby). */
  labelledBy?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();
  const index = Math.max(0, props.options.findIndex((o) => o.value === props.value));
  const current = props.options[index];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    items.current[index]?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setOpen(false);
    btn.current?.focus();
  }

  function pick(v: V) {
    if (v !== props.value) props.onChange(v);
    close();
  }

  function onKey(e: React.KeyboardEvent) {
    const n = props.options.length;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const i = items.current.findIndex((el) => el === document.activeElement);
    const focus = (j: number) => {
      e.preventDefault();
      items.current[(j + n) % n]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close the dialog around it
      close();
    } else if (e.key === "ArrowDown") focus(i + 1);
    else if (e.key === "ArrowUp") focus(i - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(n - 1);
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLocaleLowerCase();
      for (let d = 1; d <= n; d++) {
        const j = (i + d) % n;
        if (props.options[j].label.toLocaleLowerCase().startsWith(k)) return focus(j);
      }
    }
  }

  return (
    <div className="menu-wrap select" ref={wrap} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className={`select-btn${open ? " open" : ""}`}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={props.labelledBy}
      >
        <span className="label">{current?.label}</span>
        <Icon name="down" size={12} className="chev" />
      </button>
      {open && (
        <div className="menu select-menu" role="listbox" id={listId} aria-labelledby={props.labelledBy}>
          {props.options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              ref={(el) => {
                items.current[i] = el;
              }}
              role="option"
              aria-selected={o.value === props.value}
              className={o.value === props.value ? "on" : ""}
              onClick={() => pick(o.value)}
            >
              <span className="label">{o.label}</span>
              {o.value === props.value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
