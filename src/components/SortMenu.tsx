import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { SORTS, type SortKey } from "./nav";

/** Sort dropdown: a quiet toolbar button that opens a list of options, each with its own icon and a radio mark. */
export function SortMenu({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const current = SORTS.find((s) => s.key === value) ?? SORTS[0];

  // Close on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus the chosen option when the menu opens, so arrows and Enter work right away.
  useEffect(() => {
    if (open) items.current[SORTS.findIndex((s) => s.key === value)]?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(k: SortKey) {
    onChange(k);
    setOpen(false);
    wrap.current?.querySelector<HTMLButtonElement>(".sort-btn")?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    const i = items.current.findIndex((el) => el === document.activeElement);
    const move = (d: number) => {
      e.preventDefault();
      items.current[(i + d + SORTS.length) % SORTS.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close the open card
      setOpen(false);
      wrap.current?.querySelector<HTMLButtonElement>(".sort-btn")?.focus();
    } else if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Home") move(-i);
    else if (e.key === "End") move(SORTS.length - 1 - i);
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="menu-wrap" ref={wrap} onKeyDown={onKey}>
      <button
        className={`sort-btn${open ? " open" : ""}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Сортировка: ${current.label}`}
      >
        <Icon name={current.icon} size={15} />
        <span>{current.short}</span>
        <Icon name="down" size={12} className="chev" />
      </button>
      {open && (
        <div className="menu sort-menu" role="menu" aria-label="Сортировка">
          <small>Сортировка</small>
          {SORTS.map((s, i) => (
            <button
              key={s.key}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitemradio"
              aria-checked={s.key === value}
              className={s.key === value ? "on" : ""}
              onClick={() => pick(s.key)}
            >
              <span className="radio" aria-hidden="true" />
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
