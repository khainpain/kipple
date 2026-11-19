import { useEffect, useState } from "react";
import type { WindowControls } from "../platform/types";
import { T } from "../i18n";
import logoLight from "../../brand/kipple-logo-light.svg";
import logoDark from "../../brand/kipple-logo-dark.svg";
import "./TitleBar.css";

/**
 * The desktop window's own title bar (the system one is off: tauri.conf.json `decorations: false`),
 * so the logo shows once. The bar drags the window and maximizes on double-click through
 * `data-tauri-drag-region`; Windows still snaps it when dragged to an edge. The buttons use the
 * system's own glyph font, so they look like every other window's.
 */
export function TitleBar({ win }: { win: WindowControls }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    const check = () =>
      void win.isMaximized().then(
        (m) => alive && setMaximized(m),
        () => undefined, // only changes the glyph: keep the last one
      );
    // Resizing by an edge sends many events: ask once per frame.
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    check();
    const off = win.onResized(sync);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      void off.then((f) => f(), () => undefined);
    };
  }, [win]);

  const L = T.app;
  // A failed window call leaves the window as it was; there is nothing to tell the user.
  const act = (f: () => Promise<void>) => () => void f().catch(() => undefined);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-logo" data-tauri-drag-region>
        <img src={logoLight} alt="Kipple" className="only-light" data-tauri-drag-region draggable={false} />
        <img src={logoDark} alt="Kipple" className="only-dark" data-tauri-drag-region draggable={false} />
      </span>
      <div className="titlebar-buttons">
        <button type="button" tabIndex={-1} aria-label={L.winMinimize} title={L.winMinimize} onClick={act(win.minimize)}>
          {""}
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={maximized ? L.winRestore : L.winMaximize}
          title={maximized ? L.winRestore : L.winMaximize}
          onClick={act(win.toggleMaximize)}
        >
          {maximized ? "" : ""}
        </button>
        <button type="button" tabIndex={-1} className="titlebar-close" aria-label={L.winClose} title={L.winClose} onClick={act(win.close)}>
          {""}
        </button>
      </div>
    </div>
  );
}
