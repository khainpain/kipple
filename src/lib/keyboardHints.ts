/**
 * Hints under the cloud password field: is Caps Lock on, and which keyboard layout types.
 * A password field hides what is typed, so a wrong layout or Caps Lock only shows as "wrong password".
 */
export type Layout = "EN" | "RU";

/** The layout a typed key comes from, or null when the key doesn't tell (digits, symbols, Shift, other scripts). */
export function layoutFromKey(key: string): Layout | null {
  if ([...key].length !== 1) return null;
  // Any Cyrillic layout (Russian, Ukrainian, Belarusian…) shows as RU: what matters is "not Latin".
  if (/\p{Script=Cyrillic}/u.test(key)) return "RU";
  if (/\p{Script=Latin}/u.test(key)) return "EN";
  return null;
}

/** The layout before anything is typed, from the browser's keyboard map (WebView2 has it): what the Q key types. */
export function layoutFromMap(map: { get(code: string): string | undefined }): Layout | null {
  const q = map.get("KeyQ");
  return q ? layoutFromKey(q) : null;
}

type KeyboardApi = { getLayoutMap?: () => Promise<{ get(code: string): string | undefined }> };

/** The current layout from the keyboard map, or null where the browser has none (Firefox, Safari). */
export async function currentLayout(): Promise<Layout | null> {
  const kb = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
  if (!kb?.getLayoutMap) return null;
  try {
    return layoutFromMap(await kb.getLayoutMap());
  } catch {
    return null; // not allowed here (e.g. in a frame): the first typed letter tells instead
  }
}
