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
const WORD = /[\p{L}\p{N}]+/gu;

type Vec = Map<string, number>;

export interface TopicModel {
  idf: (f: string) => number;
  /** Topic → the normalised sum of its hand-sorted cards. */
  topics: Map<string, Vec>;
  /** Vectors of the library's cards, worked out once. */
  vecs: WeakMap<Card, Vec>;
}

function features(c: Card): Map<string, number> {
  const out = new Map<string, number>();
  const add = (f: string, w = 1) => out.set(f, (out.get(f) ?? 0) + w);
  const text = [effectiveTitle(c), c.text, c.link?.title, c.link?.description, c.media?.fileName].filter(Boolean).join(" ");
  for (const w of text.match(WORD) ?? []) if (w.length >= 3 && !/^\d+$/.test(w)) add(stem(w));
  if (c.forwardedFrom) add(`@${c.forwardedFrom}`, SOURCE_WEIGHT);
  const site = c.urls[0] ? domainOf(c.urls[0]) : "";
  if (site) add(`site:${site}`, SOURCE_WEIGHT);
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

/** What the person's hand sorting says about each topic. Cheap enough to redo after every edit. */
export function learnTopics(cards: Card[]): TopicModel {
  const live = cards.filter((c) => !c.removed);
  const df = new Map<string, number>();
  for (const c of live) for (const k of features(c).keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const n = live.length;
  // A feature on every card weighs 0; one never seen weighs the most.
  const idf = (f: string) => Math.log((n + 1) / ((df.get(f) ?? 0) + 1));
  const m: TopicModel = { idf, topics: new Map(), vecs: new WeakMap() };

  const sums = new Map<string, { v: Vec; count: number }>();
  for (const c of live) {
    const t = c.user?.topic ? topicName(c.user.topic) : "";
    if (!t) continue;
    const s = sums.get(t) ?? { v: new Map(), count: 0 };
    for (const [f, x] of vectorOf(m, c)) s.v.set(f, (s.v.get(f) ?? 0) + x);
    s.count++;
    sums.set(t, s);
  }
  for (const [t, s] of sums) if (s.count >= MIN_EXAMPLES) m.topics.set(t, normalise(s.v));
  return m;
}

/** The topic a card most likely belongs to by the person's own sorting, if any is close enough. */
export function suggestTopic(m: TopicModel, c: Card): string | undefined {
  if (!m.topics.size) return undefined;
  const v = vectorOf(m, c);
  let best: string | undefined;
  let top = MIN_SCORE;
  for (const [t, centre] of m.topics) {
    let dot = 0;
    for (const [f, x] of v) dot += x * (centre.get(f) ?? 0);
    if (dot >= top) [best, top] = [t, dot];
  }
  return best;
}
