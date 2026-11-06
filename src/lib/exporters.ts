import type { Card } from "./types";
import { ACTION_LABELS } from "./types";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "./library";

function csvCell(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(cards: Card[]): string {
  const head = ["id", "date", "kind", "title", "summary", "topic", "tags", "action", "source", "url", "text"];
  const rows = cards.map((c) => {
    const action = effectiveAction(c);
    return [
      String(c.id),
      c.date,
      c.kind,
      effectiveTitle(c),
      c.ai?.summary ?? "",
      effectiveTopic(c) ?? "",
      effectiveTags(c).join(", "),
      action ? ACTION_LABELS[action] : "",
      c.forwardedFrom ?? "",
      c.urls[0] ?? "",
      c.text,
    ].map(csvCell).join(",");
  });
  // BOM so Excel on Windows opens Cyrillic correctly.
  return "﻿" + [head.join(","), ...rows].join("\r\n");
}

export function toMarkdown(cards: Card[], title = "Избранное"): string {
  const byTopic = new Map<string, Card[]>();
  for (const c of cards) {
    const t = effectiveTopic(c) ?? "Без темы";
    byTopic.set(t, [...(byTopic.get(t) ?? []), c]);
  }
  const parts = [`# ${title}`, "", `Экспортировано ${new Date().toLocaleString("ru-RU")}, карточек: ${cards.length}.`, ""];
  for (const [topic, list] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
    parts.push(`## ${topic}`, "");
    for (const c of list) {
      const head = effectiveTitle(c) || c.text.split("\n")[0].slice(0, 80) || c.kind;
      const link = c.urls[0] ? ` — [${new URL(c.urls[0]).hostname}](${c.urls[0]})` : "";
      const tags = effectiveTags(c).map((t) => `#${t.replace(/\s+/g, "_")}`).join(" ");
      parts.push(`- **${head}**${link} _(${c.date.slice(0, 10)})_`);
      if (c.ai?.summary) parts.push(`  ${c.ai.summary}`);
      if (tags) parts.push(`  ${tags}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}
