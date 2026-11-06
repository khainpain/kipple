// Light / dark / follow the system. The choice is kept in localStorage (read before the
// first paint by public/theme-init.js), applied as <html data-theme="light|dark">, and
// mirrored to the desktop window's title bar.
import { useSyncExternalStore } from "react";
import { platform } from "@platform";
import { T } from "../i18n";

export type ThemePref = "system" | "light" | "dark";
export const THEME_PREFS: ThemePref[] = ["system", "light", "dark"];

// Getters so a language switch shows up on the next render.
export const THEME_LABELS: Record<ThemePref, string> = {
  get system() { return T.theme.system; },
  get light() { return T.theme.light; },
  get dark() { return T.theme.dark; },
};
export const THEME_ICONS: Record<ThemePref, string> = { system: "monitor", light: "sun", dark: "moon" };

const KEY = "kipple.theme";
const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked: fall back to the system theme */
  }
  return "system";
}

let pref = readPref();
const listeners = new Set<() => void>();

function apply() {
  const dark = pref === "dark" || (pref === "system" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // null lets the window follow the OS again, so "system" keeps live-updating.
  platform.setWindowTheme?.(pref === "system" ? null : pref)?.catch(() => {});
}

if (typeof document !== "undefined") {
  apply();
  media?.addEventListener("change", () => {
    if (pref === "system") apply();
  });
  // Another window/tab changed it.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) setThemePref(readPref());
  });
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* not persisted, still applied for this session */
  }
  apply();
  listeners.forEach((l) => l());
}

/** Light → dark → system, for the toolbar's quick toggle. */
export function nextThemePref(p: ThemePref): ThemePref {
  return p === "light" ? "dark" : p === "dark" ? "system" : "light";
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => pref,
  );
}
