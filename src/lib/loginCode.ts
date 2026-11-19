/**
 * The login code typed into the cells on the sign-in screen. Telegram's codes are digits,
 * usually 5 of them; a 6th cell appears if the code turns out longer.
 */
export const CODE_CELLS = 5;
const MAX_CODE = 6;

/** What a typed or pasted value leaves: its digits only ("48 213", "Code: 48213" → "48213"). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MAX_CODE);
}

/** The cells to draw for a code: one digit each (or ""), and the cell the next digit goes into. */
export function codeCells(code: string): { digits: string[]; active: number } {
  const n = Math.min(MAX_CODE, Math.max(CODE_CELLS, code.length));
  return { digits: Array.from({ length: n }, (_, i) => code[i] ?? ""), active: Math.min(code.length, n - 1) };
}
