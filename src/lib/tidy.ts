/**
 * Suggestions for merging topics or tags that name the same thing: case and spelling
 * variants, ё/е, hyphens and spaces, singular and plural, one-letter typos. Synonyms in
 * other languages (AI / ИИ) need the AI: see suggestSynonyms in ai.ts.
 */

export interface MergeSuggestion {
  /** The name to keep: the most used one in the group. */
  into: string;
  /** Names that would be merged into it. */
  from: string[];
  /** Cards that would change. */
  cards: number;
}

/** Lowercase, ё→е, letters and digits only. */
export function looseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** A rough stem: drops a plural or case ending so "игры"/"игра" and "games"/"game" meet. */
export function stem(key: string): string {
  if (/^[a-z0-9]+$/.test(key)) {
    if (key.length > 4 && key.endsWith("ies")) return key.slice(0, -3) + "y";
    if (key.length > 4 && /(ss|sh|ch|x)es$/.test(key)) return key.slice(0, -2);
    if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) return key.slice(0, -1);
    return key;
  }
  if (key.length > 3) return key.replace(/(ами|ями|ов|ев|ей|ам|ям|ах|ях|ы|и|а|я|е|у|ю|о|ь)$/u, "");
  return key;
}

/** Edit distance, but gives up (returns 2) as soon as it's more than 1. */
function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Groups names that look like the same word. `counts` is name → number of cards.
 * Typos are only matched in longer words (6+ letters), where one letter rarely changes the meaning.
 */
export function suggestMerges(counts: Map<string, number>): MergeSuggestion[] {
  const names = [...counts.keys()];
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => {
    let p = parent.get(n)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(n, p);
    return p;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));

  const byStem = new Map<string, string>();
  const keys = names.map((n) => ({ n, k: looseKey(n) })).filter((x) => x.k);
  for (const { n, k } of keys) {
    const s = stem(k);
    const other = byStem.get(s);
    if (other) join(n, other);
    else byStem.set(s, n);
  }
  // One-letter typos: compare only words of similar length that start the same.
  const long = keys.filter((x) => x.k.length >= 6).sort((a, b) => (a.k < b.k ? -1 : 1));
  for (let i = 0; i < long.length; i++)
    for (let j = i + 1; j < long.length && long[j].k[0] === long[i].k[0]; j++)
      if (withinOne(long[i].k, long[j].k) && !/\d/.test(long[i].k + long[j].k)) join(long[i].n, long[j].n);

  const groups = new Map<string, string[]>();
  for (const n of names) {
    const r = find(n);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }
  const out: MergeSuggestion[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => counts.get(b)! - counts.get(a)! || a.length - b.length || (a < b ? -1 : 1));
    const [into, ...from] = g;
    out.push({ into, from, cards: from.reduce((s, f) => s + counts.get(f)!, 0) });
  }
  return out.sort((a, b) => b.cards - a.cards);
}
