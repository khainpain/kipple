import MiniSearch from "minisearch";
import type { Card } from "./types";
import { effectiveTags, effectiveTitle, effectiveTopic } from "./library";

export function buildIndex(cards: Card[]) {
  const ms = new MiniSearch<{ id: number; title: string; text: string; tags: string; topic: string; site: string; source: string }>({
    fields: ["title", "text", "tags", "topic", "site", "source"],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, tags: 2, topic: 2 }, combineWith: "AND" },
  });
  ms.addAll(
    cards.map((c) => ({
      id: c.id,
      title: effectiveTitle(c),
      text: [c.text, c.ai?.summary, c.link?.description, c.media?.fileName].filter(Boolean).join(" "),
      tags: effectiveTags(c).join(" "),
      topic: effectiveTopic(c) ?? "",
      site: c.link?.siteName ?? c.urls.map((u) => u.split("/")[2] ?? "").join(" "),
      source: c.forwardedFrom ?? "",
    })),
  );
  return ms;
}
