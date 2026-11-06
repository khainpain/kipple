import { describe, expect, it } from "vitest";
import { ExportFormatError, parseExport } from "./parser";
import { isSensitive } from "./rules";
import { applyEdits, effectiveAction, matchesFilter, mergeImport } from "./library";
import fixture from "../../fixtures/saved_messages.json";

describe("parseExport", () => {
  const res = parseExport(fixture);

  it("reads the chat and skips service messages", () => {
    expect(res.chatName).toBe("Saved Messages");
    expect(res.chatType).toBe("saved_messages");
    expect(res.skipped).toBe(1);
  });

  it("flattens rich text and collects links and hashtags", () => {
    const c = res.cards.find((x) => x.id === 2)!;
    expect(c.kind).toBe("link");
    expect(c.text).toBe("Смотри статью про masonry #design");
    expect(c.urls).toEqual(["https://example.com/masonry"]);
    expect(c.hashtags).toEqual(["design"]);
  });

  it("turns a bare url into a link card", () => {
    const c = res.cards.find((x) => x.id === 3)!;
    expect(c.kind).toBe("link");
    expect(c.urls).toEqual(["https://www.youtube.com/watch?v=abc123"]);
  });

  it("keeps photo paths and sizes, merges albums sent in the same second", () => {
    const c = res.cards.find((x) => x.id === 4)!;
    expect(c.kind).toBe("photo");
    expect(c.media).toMatchObject({ path: "photos/photo_1@01-03-2024_10-00-00.jpg", width: 1280, height: 960 });
    expect(c.albumIds).toEqual([5]);
    expect(c.album?.[0].path).toBe("photos/photo_2@01-03-2024_10-00-00.jpg");
    expect(res.cards.find((x) => x.id === 5)).toBeUndefined();
    expect(c.forwardedFrom).toBe("Дизайн-канал");
  });

  it("marks media that was not exported", () => {
    const c = res.cards.find((x) => x.id === 6)!;
    expect(c.kind).toBe("video");
    expect(c.media?.missing).toBe(true);
    expect(c.media?.path).toBeUndefined();
    expect(c.media?.duration).toBe(42);
  });

  it("recognises documents, voice and stickers", () => {
    expect(res.cards.find((x) => x.id === 7)!.kind).toBe("document");
    expect(res.cards.find((x) => x.id === 7)!.media?.fileName).toBe("report.pdf");
    expect(res.cards.find((x) => x.id === 8)!.kind).toBe("voice");
    const sticker = res.cards.find((x) => x.id === 9)!;
    expect(sticker.kind).toBe("sticker");
    expect(sticker.autoJunk).toBe(true);
  });

  it("flags sensitive messages", () => {
    expect(res.cards.find((x) => x.id === 10)!.sensitive).toBe(true);
    expect(res.cards.find((x) => x.id === 2)!.sensitive).toBeUndefined();
  });

  it("finds Saved Messages inside a full account export", () => {
    const full = { chats: { list: [{ type: "personal_chat", messages: [] }, fixture] } };
    expect(parseExport(full).cards.length).toBe(res.cards.length);
  });

  it("rejects files that are not an export", () => {
    expect(() => parseExport({ foo: 1 })).toThrow(ExportFormatError);
    expect(() => parseExport({ chats: { list: [{ type: "personal_chat", messages: [] }] } })).toThrow(ExportFormatError);
  });
});

describe("rules", () => {
  it("detects secrets without flagging ordinary text", () => {
    expect(isSensitive("пароль: hunter2")).toBe(true);
    expect(isSensitive("карта 4111 1111 1111 1111")).toBe(true);
    expect(isSensitive("abandon ability able about above absent absorb abstract absurd abuse access accident")).toBe(true);
    expect(isSensitive("встреча в 15:00, телефон 89161234567")).toBe(false);
    expect(isSensitive("Номер заказа 1234567890123")).toBe(false);
  });
});

describe("library", () => {
  it("keeps AI fields and user edits across re-imports and marks removed cards", () => {
    const first = parseExport(fixture);
    const lib = mergeImport(null, { chatName: "x", sourceDir: "/a", importedAt: "t1", cards: first.cards });
    const c2 = lib.cards.find((c) => c.id === 2)!;
    c2.ai = { title: "Masonry", summary: "s", topic: "Дизайн", tags: ["css"], action: "read_later", priority: 2, model: "m", at: "t" };
    applyEdits(lib.cards, [{ t: "t", id: 3, patch: { action: "junk" } }]);

    const second = parseExport(fixture);
    second.cards = second.cards.filter((c) => c.id !== 10);
    const merged = mergeImport(lib, { chatName: "x", sourceDir: "/a", importedAt: "t2", cards: second.cards });
    expect(merged.cards.find((c) => c.id === 2)!.ai?.title).toBe("Masonry");
    expect(effectiveAction(merged.cards.find((c) => c.id === 3)!)).toBe("junk");
    expect(merged.cards.find((c) => c.id === 10)!.removed).toBe(true);
  });

  it("hides junk from every filter except Junk", () => {
    const { cards } = parseExport(fixture);
    const sticker = cards.find((c) => c.id === 9)!;
    expect(matchesFilter(sticker, "all")).toBe(false);
    expect(matchesFilter(sticker, "junk")).toBe(true);
  });
});
