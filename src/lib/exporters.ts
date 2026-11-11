import type { Card } from "./types";
import { actionLabel } from "./types";
import { T, locale } from "../i18n";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "./library";

function csvCell(v: string): string {
  // A cell starting with = + - @ is run as a formula by Excel; a leading ' keeps it text.
  // A "- " list item can't be a formula, so it stays as it is.
  if (/^([=+@\t\r]|-(?!\s))/.test(v)) v = "'" + v;
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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
      action ? actionLabel(action) : "",
      c.forwardedFrom ?? "",
      c.urls[0] ?? "",
      c.text,
    ].map(csvCell).join(",");
  });
  // BOM so Excel on Windows opens Cyrillic correctly.
  return "﻿" + [head.join(","), ...rows].join("\r\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function toMarkdown(cards: Card[], title = T.importer.savedMessages): string {
  const byTopic = new Map<string, Card[]>();
  for (const c of cards) {
    const t = effectiveTopic(c) || T.exporter.noTopic;
    byTopic.set(t, [...(byTopic.get(t) ?? []), c]);
  }
  const parts = [`# ${title}`, "", T.exporter.exported(new Date().toLocaleString(locale()), cards.length), ""];
  for (const [topic, list] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
    parts.push(`## ${topic}`, "");
    for (const c of list) {
      const head = effectiveTitle(c) || c.text.split("\n")[0].slice(0, 80) || c.kind;
      const link = c.urls[0] ? ` — [${hostOf(c.urls[0])}](${c.urls[0]})` : "";
      const tags = effectiveTags(c).map((t) => `#${t.replace(/\s+/g, "_")}`).join(" ");
      parts.push(`- **${head}**${link} _(${c.date.slice(0, 10)})_`);
      if (c.ai?.summary) parts.push(`  ${c.ai.summary}`);
      if (tags) parts.push(`  ${tags}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}
