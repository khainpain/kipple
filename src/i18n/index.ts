// Interface language. Strings live in ru.ts (the reference) and en.ts, which must have the
// same shape; TypeScript fails the build if a key is missing in one of them.
//
// Usage: `import { T } from "../i18n/index.js"` and read `T.section.key` (or call it when the string
// takes parameters) at render time. `T` is a live binding, so after setLang() the next render
// picks up the new language; nothing needs to subscribe.
import { ru, type Dict } from "./ru.js";
import { en } from "./en.js";

export type Lang = "ru" | "en";
/** What the user picked in Settings: a language, or follow the system. */
export type LangPref = "auto" | Lang;

export const LANGS: Array<{ key: Lang; name: string }> = [
  { key: "ru", name: "Русский" },
  { key: "en", name: "English" },
];

const DICTS: Record<Lang, Dict> = { ru, en };
const PREF_KEY = "sb.lang";

/** Russian for systems set to Russian or a language whose speakers mostly read Russian; English otherwise. */
export function systemLang(): Lang {
  const list = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of list) {
    const base = (tag ?? "").toLowerCase().split("-")[0];
    if (base === "ru" || base === "be" || base === "kk" || base === "ky") return "ru";
    if (base === "en") return "en";
  }
  return "en";
}

export function resolveLang(pref: LangPref | undefined): Lang {
  return pref === "ru" || pref === "en" ? pref : systemLang();
}

/** The language for the first paint, before settings.json is read: the last choice, cached in localStorage. */
function initialLang(): Lang {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === "ru" || v === "en") return v;
  } catch {
    /* no storage: fall back to the system language */
  }
  return systemLang();
}

let current: Lang = initialLang();
export let T: Dict = DICTS[current];
if (typeof document !== "undefined") document.documentElement.lang = current;

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  current = l;
  T = DICTS[l];
  try {
    localStorage.setItem(PREF_KEY, l);
  } catch {
    /* only speeds up the next start */
  }
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

/**
 * Locale for dates, numbers and sorting. Keeps the system's regional variant when it is
 * the same language (en-GB stays en-GB), otherwise the plain language.
 */
export function locale(): string {
  const sys = typeof navigator === "undefined" ? "" : navigator.language ?? "";
  return sys.toLowerCase().startsWith(current) ? sys : current === "ru" ? "ru-RU" : "en-US";
}

export function formatNumber(n: number): string {
  return n.toLocaleString(locale());
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, locale());
}
