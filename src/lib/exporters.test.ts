import { describe, expect, it } from "vitest";
import { toCsv, toMarkdown } from "./exporters";
import { mergeImport } from "./library";
import type { Card, Library } from "./types";

const card = (id: number, over: Partial<Card> = {}): Card => ({ id, date: "2026-01-01T10:00:00", kind: "text", text: "", urls: [], hashtags: [], ...over });

describe("exports", () => {
  it("keeps formulas as text in CSV and quotes a bare carriage return", () => {
    const csv = toCsv([card(1, { text: '=HYPERLINK("http://x","y")' }), card(2, { text: "a\rb" })]);
    const rows = csv.split("\r\n");
    expect(rows[1].endsWith(`"'=HYPERLINK(""http://x"",""y"")"`)).toBe(true);
    expect(rows[2].endsWith('"a\rb"')).toBe(true);
  });
  it("does not fail Markdown on a link that isn't a valid URL", () => {
    expect(() => toMarkdown([card(1, { text: "see http://[oops", urls: ["http://[oops"] })])).not.toThrow();
  });
});

describe("mergeImport", () => {
  const prev: Library = {
    version: 1,
    chatName: "Saved",
    sourceDir: "a",
    importedAt: "t",
    cards: [card(1), card(2), card(50)],
    telegram: { top: 50 } as Library["telegram"],
    subgroups: { Tech: { at: "t", groups: [] } },
  };
  it("keeps Telegram progress, subgroups and messages newer than the export", () => {
    const lib = mergeImport(prev, { chatName: "Saved", sourceDir: "b", importedAt: "t2", cards: [card(1), card(10)] });
    expect(lib.telegram).toEqual(prev.telegram);
    expect(lib.subgroups).toEqual(prev.subgroups);
    const byId = new Map(lib.cards.map((c) => [c.id, c]));
    expect(byId.get(2)?.removed).toBe(true);
    expect(byId.get(50)?.removed).toBeUndefined();
  });
});
