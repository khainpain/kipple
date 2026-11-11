import MiniSearch, { type Query } from "minisearch";
import type { Card } from "./types";
import { actionLabel } from "./types";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic, getAliases } from "./library";
import { isImportant } from "./smart";
import { T } from "../i18n";
import { fold, stem } from "./stem";

/** Canonical name → the names merged into it, so searching an old name still finds the cards. */
function reverse(map: Record<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [from, to] of Object.entries(map)) out.set(to, [...(out.get(to) ?? []), from]);
  return out;
}

export function buildIndex(cards: Card[]) {
  const aliases = getAliases();
  const tagSyn = reverse(aliases.tags);
  const topicSyn = reverse(aliases.topics);
  const stems = new Map<string, string>(); // words repeat a lot across cards
  const ms = new MiniSearch<{ id: number; title: string; text: string; tags: string; topic: string; status: string; site: string; source: string }>({
    fields: ["title", "text", "tags", "topic", "status", "site", "source"],
    // Each word goes in whole and as its stem, so search can match either (see wordForms).
    processTerm: (term) => {
      const word = fold(term);
      let s = stems.get(word);
      if (s === undefined) stems.set(word, (s = stem(word)));
      return s === word ? word : [word, s];
    },
    searchOptions: { processTerm: fold, prefix: true, fuzzy: 0.2, boost: { title: 3, tags: 2, topic: 2 }, combineWith: "AND" },
  });
  ms.addAll(
    cards.map((c) => {
      const tags = effectiveTags(c);
      const topic = effectiveTopic(c) ?? "";
      const action = effectiveAction(c);
      return {
        id: c.id,
        title: effectiveTitle(c),
        text: [c.text, c.ai?.summary, c.link?.description, c.media?.fileName].filter(Boolean).join(" "),
        tags: [...tags, ...tags.flatMap((t) => tagSyn.get(t) ?? [])].join(" "),
        topic: [topic, ...(topicSyn.get(topic) ?? [])].join(" "),
        // "read later", "important" and so on, so a search can combine a subject with a status.
        status: [action && actionLabel(action), isImportant(c) && T.nav.important].filter(Boolean).join(" "),
        site: c.link?.siteName ?? c.urls.map((u) => u.split("/")[2] ?? "").join(" "),
        source: c.forwardedFrom ?? "",
      };
    }),
  );
  return { search: (q: string) => ms.search(wordForms(q)) };
}

/**
 * Each query word matches as typed (prefix and typos allowed, so a half-typed word works)
 * or by its exact stem ("кошка" finds "кошкой"). A prefix match on the stem would be too
 * loose: half-typed "красив" stems to "крас" and would find "красный".
 */
function wordForms(q: string): Query {
  return {
    combineWith: "AND",
    queries: MiniSearch.getDefault("tokenize")(q).flatMap((term: string) => {
      const word = fold(term);
      if (!word) return [];
      const s = stem(word);
      return [s === word ? word : { combineWith: "OR", queries: [word, { queries: [s], prefix: false, fuzzy: false }] }];
    }),
  };
}
