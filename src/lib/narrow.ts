import { useSyncExternalStore } from "react";

/** Phone widths. The desktop window can't get this narrow (minWidth 720 in tauri.conf.json),
 *  so everything gated on it only changes the browser build on phones. Keep in sync with
 *  the `max-width: 640px` block in App.css. */
export const NARROW_QUERY = "(max-width: 640px)";

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;

function subscribe(cb: () => void) {
  media?.addEventListener("change", cb);
  return () => media?.removeEventListener("change", cb);
}

/** True on a phone-sized screen: the sidebar becomes a drawer and cards open full screen. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false);
}
