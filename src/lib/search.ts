import MiniSearch from "minisearch";
import type { Card } from "./types";
import { actionLabel } from "./types";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic, getAliases } from "./library";
import { isImportant } from "./smart";
import { T } from "../i18n";

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
  const ms = new MiniSearch<{ id: number; title: string; text: string; tags: string; topic: string; status: string; site: string; source: string }>({
    fields: ["title", "text", "tags", "topic", "status", "site", "source"],
    // Russian writes ё and е interchangeably: "елка" should find "ёлку".
    processTerm: (term) => term.toLowerCase().replace(/ё/g, "е"),
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, tags: 2, topic: 2 }, combineWith: "AND" },
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
  return ms;
}
