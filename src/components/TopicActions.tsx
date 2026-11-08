import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { T } from "../i18n";
import { Icon } from "./Icon";

const WIDTH = 240;

/**
 * Rename or delete a topic: a small popover next to the sidebar row. Deleting asks once,
 * right in the popover, with how many cards will be left without a topic.
 */
export function TopicActions(props: { anchor: HTMLElement; name: string; count: number; onRename: () => void; onDelete: () => void; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, up: false });

  useLayoutEffect(() => {
    const r = props.anchor.getBoundingClientRect();
    const up = r.bottom + 160 > window.innerHeight;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)), top: up ? r.top - 4 : r.bottom + 4, up });
  }, [props.anchor]);

  useEffect(() => {
    const close = () => props.onClose();
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="popover-backdrop" onMouseDown={props.onClose} onContextMenu={(e) => (e.preventDefault(), props.onClose())}>
      <div
        className={`menu topic-menu topic-actions${pos.up ? " up" : ""}`}
        style={{ left: pos.left, top: pos.top, width: WIDTH }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.stopPropagation();
          props.onClose();
        }}
      >
        {confirm ? (
          <>
            <p className="topic-actions-text">{T.topics.confirmDelete(props.name, props.count)}</p>
            <div className="topic-actions-row">
              <button className="secondary small-btn" onClick={props.onClose}>
                {T.common.cancel}
              </button>
              <button className="danger small-btn" autoFocus onClick={() => (props.onDelete(), props.onClose())}>
                {T.topics.confirm}
              </button>
            </div>
          </>
        ) : (
          <>
            <button autoFocus onClick={() => (props.onRename(), props.onClose())}>
              <Icon name="pencil" size={14} />
              <span className="label">{T.topics.rename}</span>
            </button>
            <button className="topic-actions-delete" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={14} />
              <span className="label">{T.topics.delete}</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
