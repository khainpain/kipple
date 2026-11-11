import type { Card } from "./types";
import { effectiveTitle, topicName } from "./library";
import { domainOf } from "./rules";
import { stem } from "./stem";

/**
 * Topic suggestions learned from the person's own sorting, with no model and nothing sent
 * anywhere: each topic is the average of the cards put into it by hand (word stems, channel,
 * site, weighted so words found everywhere count for nothing), and an unsorted card is
 * offered the topic it is most alike, if it is alike enough.
 */

/** A topic needs this many cards put into it by hand before it is suggested for others. */
export const MIN_EXAMPLES = 2;
/** How alike (cosine, 0 to 1) a card must be to a topic's cards to be offered it. */
const MIN_SCORE = 0.15;
/** A channel or site says more about a card than any one word in it. */
const SOURCE_WEIGHT = 3;
/** Enough of a long text to tell what it is about, without stemming a whole book on every edit. */
const MAX_TEXT = 4000;
const WORD = /[\p{L}\p{N}]+/gu;
const URL_TEXT = /https?:\/\/\S+|www\.\S+/g;
/** Words that say nothing about a topic, however rare they happen to be in a small library. */
const STOP = new Set(
  (
    "что это эта эти этот как для все всё так уже или его она они оно мне меня тебя тебе там тут вот был была было были есть будет когда где чем если еще ещё очень просто только можно нужно надо даже про при без под над после через который которая которое которые того такой такая такие свой своя свои наш ваш нас вас них неё нее себя себе тоже также потом сейчас здесь кто чтобы будто какой какая какие " +
    "the and for you that this with are was were have has had from not but all can your our out just they them what when how about will one get got new its it's into than then there their here also more some any http https www com"
  ).split(" "),
);

type Vec = Map<string, number>;

export interface TopicModel {
  idf: (f: string) => number;
  /** Topic → the normalised sum of its hand-sorted cards. */
  topics: Map<string, Vec>;
  /** Vectors of the library's cards, worked out once. */
  vecs: WeakMap<Card, Vec>;
}

/** How strict a suggestion is: `bulk` is for moving a whole pile at once. */
export interface SuggestOptions {
  bulk?: boolean;
}
/** Bulk: a closer likeness, and two words in common or the same channel or site, not one lucky word. */
const BULK_SCORE = 0.2;

/** Features by card, kept while the card's text stays the same: an edit elsewhere doesn't stem it all again. */
const cache = new WeakMap<Card, { src: string; f: Map<string, number> }>();
/** Words repeat a lot across cards; stemming each once is most of the speed. */
const stems = new Map<string, string>();

function features(c: Card): Map<string, number> {
  const text = [effectiveTitle(c), c.text, c.link?.title, c.link?.description, c.media?.fileName].filter((t) => typeof t === "string" && t).join(" ").slice(0, MAX_TEXT).replace(URL_TEXT, " ");
  const site = c.urls?.[0] ? domainOf(c.urls[0]) : "";
  const src = `${text}\u0000${c.forwardedFrom ?? ""}\u0000${site}`;
  const hit = cache.get(c);
  if (hit?.src === src) return hit.f;
  const out = new Map<string, number>();
  const add = (f: string, w = 1) => out.set(f, (out.get(f) ?? 0) + w);
  for (const raw of text.match(WORD) ?? []) {
    const w = raw.toLowerCase();
    if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue;
    let s = stems.get(w);
    if (s === undefined) stems.set(w, (s = stem(w)));
    add(s);
  }
  if (c.forwardedFrom) add(`@${c.forwardedFrom}`, SOURCE_WEIGHT);
  if (site) add(`site:${site}`, SOURCE_WEIGHT);
  cache.set(c, { src, f: out });
  return out;
}

function normalise(v: Vec): Vec {
  const len = Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  if (len) for (const [k, x] of v) v.set(k, x / len);
  return v;
}

function vectorOf(m: Pick<TopicModel, "idf" | "vecs">, c: Card): Vec {
  let v = m.vecs.get(c);
  if (!v) {
    v = new Map();
    for (const [f, n] of features(c)) {
      const w = n * m.idf(f);
      if (w > 0) v.set(f, w);
    }
    m.vecs.set(c, normalise(v));
  }
  return v;
}

/** The topic a card teaches: one picked by hand, on a card that is neither sensitive nor thrown out. */
function taught(c: Card): string {
  return c.user?.topic && !c.sensitive && c.user.action !== "junk" && !c.user.hidden ? topicName(c.user.topic) : "";
}

/** What the person's hand sorting says about each topic. Stems are cached, so redoing it after an edit is cheap. */
export function learnTopics(cards: Card[]): TopicModel {
  const live = cards.filter((c) => !c.removed);
  const empty: TopicModel = { idf: () => 0, topics: new Map(), vecs: new WeakMap() };
  // Nothing sorted by hand yet (the usual start): no need to read every card.
  const examples = new Map<string, number>();
  for (const c of live) {
    const t = taught(c);
    if (t) examples.set(t, (examples.get(t) ?? 0) + 1);
  }
  if (![...examples.values()].some((n) => n >= MIN_EXAMPLES)) return empty;
  const df = new Map<string, number>();
  for (const c of live) for (const k of features(c).keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const n = live.length;
  // A feature on every card weighs 0; one never seen weighs the most.
  const idf = (f: string) => Math.log((n + 1) / ((df.get(f) ?? 0) + 1));
  const m: TopicModel = { idf, topics: new Map(), vecs: new WeakMap() };

  const sums = new Map<string, { v: Vec; count: number }>();
  for (const c of live) {
    const t = taught(c);
    if (!t || (examples.get(t) ?? 0) < MIN_EXAMPLES) continue;
    const s = sums.get(t) ?? { v: new Map(), count: 0 };
    for (const [f, x] of vectorOf(m, c)) s.v.set(f, (s.v.get(f) ?? 0) + x);
    s.count++;
    sums.set(t, s);
  }
  for (const [t, s] of sums) m.topics.set(t, normalise(s.v));
  return m;
}

/** The topic a card most likely belongs to by the person's own sorting, if any is close enough. */
export function suggestTopic(m: TopicModel, c: Card, opts: SuggestOptions = {}): string | undefined {
  // Taken out of a topic by hand ("") is a decision too; a sensitive card is never offered anywhere.
  if (!m.topics.size || c.user?.topic === "" || c.sensitive) return undefined;
  const v = vectorOf(m, c);
  let best: string | undefined;
  let top = opts.bulk ? BULK_SCORE : MIN_SCORE;
  for (const [t, centre] of m.topics) {
    let dot = 0;
    for (const [f, x] of v) dot += x * (centre.get(f) ?? 0);
    if (dot > top || (!best && dot === top)) [best, top] = [t, dot];
  }
  if (!best || !opts.bulk) return best;
  const centre = m.topics.get(best)!;
  const shared = [...v.keys()].filter((f) => centre.has(f));
  return shared.length >= 2 || shared.some((f) => f.startsWith("@") || f.startsWith("site:")) ? best : undefined;
}
