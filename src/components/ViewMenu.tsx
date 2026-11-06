import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { VIEWS, VIEW_FIELDS, canHide, type CardField, type CardLook, type ViewKey } from "./nav";
import { T } from "../i18n";

function fieldLabel(f: CardField): string {
  const t = T.toolbar;
  return { cover: t.fieldCover, title: t.fieldTitle, excerpt: t.fieldExcerpt, tags: t.fieldTags, info: t.fieldInfo }[f];
}

/**
 * View dropdown: picks one of the four views, and for that view which parts of a card to show
 * and, in the list, which side the cover goes. Stays open while you tweak; Esc or a click outside closes it.
 */
export function ViewMenu(props: { view: ViewKey; onView: (v: ViewKey) => void; look: CardLook; onLook: (l: CardLook) => void }) {
  const { view, look } = props;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const hidden = look.hidden[view];
  const fields = VIEW_FIELDS[view];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus the chosen view when the menu opens, so arrows and Enter work right away.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>("button.on")?.focus();
  }, [open]);

  function toggle(f: CardField) {
    const on = hidden.includes(f);
    if (!on && !canHide(hidden, f)) return;
    props.onLook({ ...look, hidden: { ...look.hidden, [view]: on ? hidden.filter((x) => x !== f) : [...hidden, f] } });
  }

  function close() {
    setOpen(false);
    wrap.current?.querySelector<HTMLButtonElement>(".sort-btn")?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = items.findIndex((el) => el === document.activeElement);
    const move = (d: number) => {
      e.preventDefault();
      items[(i + d + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close the open card
      close();
    } else if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Home") move(-i);
    else if (e.key === "End") move(items.length - 1 - i);
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
        title={`${T.toolbar.view}: ${current.label}`}
      >
        <Icon name={current.icon} size={15} />
        <span>{current.label}</span>
        <Icon name="down" size={12} className="chev" />
      </button>
      {open && (
        <div className="menu sort-menu view-menu" role="menu" aria-label={T.toolbar.view} ref={menu}>
          <small>{T.toolbar.view}</small>
          {VIEWS.map((v) => (
            <button key={v.key} role="menuitemradio" aria-checked={v.key === view} className={v.key === view ? "on" : ""} onClick={() => props.onView(v.key)}>
              <span className="radio" aria-hidden="true" />
              <Icon name={v.icon} />
              <span>{v.label}</span>
            </button>
          ))}

          <hr />
          <small>{T.toolbar.show}</small>
          {fields.map((f) => {
            const shown = !hidden.includes(f);
            return (
              <button key={f} role="menuitemcheckbox" aria-checked={shown} className={shown ? "on" : ""} disabled={shown && !canHide(hidden, f)} onClick={() => toggle(f)}>
                <span className="checkbox" aria-hidden="true">
                  {shown && <Icon name="check" size={11} />}
                </span>
                <span>{fieldLabel(f)}</span>
              </button>
            );
          })}

          {view === "list" && !hidden.includes("cover") && (
            <>
              <hr />
              <small>{T.toolbar.coverSide}</small>
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  role="menuitemradio"
                  aria-checked={look.coverSide === side}
                  className={look.coverSide === side ? "on" : ""}
                  onClick={() => props.onLook({ ...look, coverSide: side })}
                >
                  <span className="radio" aria-hidden="true" />
                  <span>{side === "left" ? T.toolbar.coverLeft : T.toolbar.coverRight}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
