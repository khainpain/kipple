import { describe, expect, it } from "vitest";
import type { SavedMessage, SavedPage } from "../platform/types";
import { addCards, backupSaved, emptyTelegramLibrary, messagesToCards, pendingPhotos, syncSaved, textEntities, toRawMessage, type SyncDeps } from "./tgImport";
import type { Library } from "./types";

const msg = (id: number, over: Partial<SavedMessage> = {}): SavedMessage => ({ id, date: 1_700_000_000 + id * 100, text: "", entities: [], ...over });

describe("textEntities", () => {
  it("splits text into plain runs, links and hashtags (UTF-16 offsets)", () => {
    const text = "Смотри 👀 https://a.io и #идеи, а тут ссылка";
    const url = text.indexOf("https");
    const tag = text.indexOf("#");
    const link = text.indexOf("ссылка");
    const ents = textEntities({
      text,
      entities: [
        { kind: "hashtag", offset: tag, length: 5 },
        { kind: "url", offset: url, length: 12 },
        { kind: "text_url", offset: link, length: 6, url: "https://b.io/x" },
      ],
    });
    expect(ents).toEqual([
      { type: "plain", text: "Смотри 👀 " },
      { type: "link", text: "https://a.io" },
      { type: "plain", text: " и " },
      { type: "hashtag", text: "#идеи" },
      { type: "plain", text: ", а тут " },
      { type: "text_link", text: "ссылка", href: "https://b.io/x" },
    ]);
  });

  it("keeps plain text whole and skips overlapping entities", () => {
    expect(textEntities({ text: "abc", entities: [] })).toEqual([{ type: "plain", text: "abc" }]);
    expect(textEntities({ text: "abcdef", entities: [{ kind: "url", offset: 0, length: 4 }, { kind: "hashtag", offset: 2, length: 2 }] })).toEqual([
      { type: "link", text: "abcd" },
      { type: "plain", text: "ef" },
    ]);
  });
});

describe("messagesToCards", () => {
  it("makes the same kinds of cards as the export", () => {
    const cards = messagesToCards([
      msg(5, { text: "see https://a.io", entities: [{ kind: "url", offset: 4, length: 12 }] }),
      msg(4, { media: { kind: "photo", width: 800, height: 600 }, forwardedFrom: "Channel" }),
      msg(3, { media: { kind: "video_file", width: 1280, height: 720, duration: 12.4, mime: "video/mp4", size: 1000 } }),
      msg(2, { media: { kind: "document", fileName: "a.pdf", mime: "application/pdf", size: 10 } }),
      msg(1, { media: { kind: "poll", pollQuestion: "Q?", pollAnswers: ["A", "B"] } }),
      msg(6, { media: { kind: "voice_message", duration: 3 } }),
      msg(7, { media: { kind: "location", latitude: 1.5, longitude: 2.5 } }),
    ]);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get(5)).toMatchObject({ kind: "link", urls: ["https://a.io"] });
    expect(byId.get(4)).toMatchObject({ kind: "photo", forwardedFrom: "Channel", media: { width: 800, height: 600, inTelegram: true } });
    expect(byId.get(4)!.media!.path).toBeUndefined();
    expect(byId.get(4)!.media!.missing).toBeUndefined();
    expect(byId.get(3)).toMatchObject({ kind: "video", media: { duration: 12, mime: "video/mp4", size: 1000 } });
    expect(byId.get(2)).toMatchObject({ kind: "document", media: { fileName: "a.pdf" } });
    expect(byId.get(1)).toMatchObject({ kind: "poll", text: "Q?\n• A\n• B" });
    expect(byId.get(6)!.kind).toBe("voice");
    expect(byId.get(7)).toMatchObject({ kind: "location", text: "1.5, 2.5" });
  });

  it("merges an album sent in the same second", () => {
    const date = 1_700_000_000;
    const cards = messagesToCards([
      msg(11, { date, media: { kind: "photo" } }),
      msg(10, { date, text: "trip", media: { kind: "photo" } }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 10, albumIds: [11] });
  });

  it("maps a raw message with the export's field names", () => {
    expect(toRawMessage(msg(1, { media: { kind: "sticker", emoji: "🙂" } }))).toMatchObject({ media_type: "sticker", sticker_emoji: "🙂" });
  });
});

/** A fake Saved Messages chat with ids 1..n, served newest first, 3 per page. */
function fakeChat(n: number, opts: { failAt?: number } = {}) {
  let ids = Array.from({ length: n }, (_, i) => i + 1);
  const calls: Array<[number, number]> = [];
  const photoCalls: number[][] = [];
  const tg: SyncDeps["tg"] = {
    async savedPage(offsetId, minId): Promise<SavedPage> {
      calls.push([offsetId, minId]);
      if (opts.failAt !== undefined && calls.length === opts.failAt) throw new Error("NETWORK");
      const page = ids
        .filter((id) => id > minId && (offsetId === 0 || id < offsetId))
        .sort((a, b) => b - a)
        .slice(0, 3);
      return { messages: page.map((id) => msg(id, { media: id % 2 ? { kind: "photo" } : undefined, text: id % 2 ? "" : `note ${id}` })), nextOffset: page.length ? Math.min(...page) : null, total: ids.length };
    },
    async savedPhotos(batch) {
      photoCalls.push(batch);
      return batch.filter((id) => id !== 3).map((id) => ({ id, path: `/data/telegram-media/${id}.jpg` }));
    },
  };
  return {
    tg,
    calls,
    photoCalls,
    add(more: number) {
      const max = Math.max(...ids);
      ids = [...ids, ...Array.from({ length: more }, (_, i) => max + i + 1)];
    },
  };
}

function deps(tg: SyncDeps["tg"], saved: Library[] = []): SyncDeps {
  return {
    tg,
    save: async (l) => void saved.push(structuredClone(l)),
    onProgress: () => undefined,
    onChange: () => undefined,
    signal: new AbortController().signal,
  };
}

describe("link preview pictures", () => {
  it("marks links whose Telegram preview has a picture and queues it with the photos", () => {
    const link = (id: number, webPhoto: boolean) => msg(id, { text: "https://example.com/a", entities: [{ kind: "url", offset: 0, length: 21 }], webPhoto });
    const lib = emptyTelegramLibrary();
    addCards(lib, messagesToCards([link(1, true), link(2, false), msg(3, { media: { kind: "photo" } })]));
    const byId = (id: number) => lib.cards.find((c) => c.id === id)!;
    expect(byId(1).kind).toBe("link");
    expect(byId(1).preview).toEqual({ inTelegram: true });
    expect(byId(2).preview).toBeUndefined();
    expect(pendingPhotos(lib).sort()).toEqual([1, 3]);
    byId(1).preview!.path = "/data/telegram-media/1.jpg";
    expect(pendingPhotos(lib)).toEqual([3]);
  });
});

describe("syncSaved", () => {
  it("loads everything, downloads photos, then only what's new", async () => {
    const chat = fakeChat(8);
    const lib = emptyTelegramLibrary();
    const r1 = await syncSaved(lib, deps(chat.tg));
    expect(r1.added).toBe(8);
    expect(lib.cards).toHaveLength(8);
    expect(lib.telegram).toEqual({ top: 8, noPhoto: [3] });
    expect(lib.cards.find((c) => c.id === 5)!.media!.path).toBe("/data/telegram-media/5.jpg");
    expect(pendingPhotos(lib)).toEqual([]);

    chat.add(2);
    chat.calls.length = 0;
    const r2 = await syncSaved(lib, deps(chat.tg));
    expect(r2.added).toBe(2);
    expect(chat.calls[0]).toEqual([0, 8]);
    expect(lib.telegram!.top).toBe(10);
    expect(lib.cards).toHaveLength(10);
  });

  it("retries a photo whose download failed, instead of marking it as having none", async () => {
    const chat = fakeChat(6);
    let fail = true;
    const inner = chat.tg.savedPhotos;
    chat.tg.savedPhotos = async (batch) => (await inner(batch)).map((p) => (p.id === 5 && fail ? { id: 5, path: "" } : p));
    const lib = emptyTelegramLibrary();
    const r1 = await syncSaved(lib, deps(chat.tg));
    expect(lib.telegram!.noPhoto).toEqual([3]);
    expect(pendingPhotos(lib)).toEqual([5]);
    expect(r1.photos).toBe(1);
    fail = false;
    await syncSaved(lib, deps(chat.tg));
    expect(lib.cards.find((c) => c.id === 5)!.media!.path).toBe("/data/telegram-media/5.jpg");
    expect(pendingPhotos(lib)).toEqual([]);
  });

  it("carries on after an interruption without losing the gap", async () => {
    const chat = fakeChat(10, { failAt: 3 });
    const lib = emptyTelegramLibrary();
    const saved: Library[] = [];
    await expect(syncSaved(lib, deps(chat.tg, saved))).rejects.toThrow("NETWORK");
    // Two pages (10..5) came in; the pass remembers where it stopped.
    expect(lib.telegram).toMatchObject({ top: 0, cursor: 5, passTop: 10 });
    const again = fakeChat(10);
    const r = await syncSaved(lib, deps(again.tg));
    expect(again.calls[0]).toEqual([5, 0]);
    expect(r.added).toBe(4);
    expect(lib.cards.map((c) => c.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lib.telegram).toMatchObject({ top: 10 });
    expect(lib.telegram!.cursor).toBeUndefined();
  });

  it("only loads messages newer than an export import", async () => {
    const lib: Library = { ...emptyTelegramLibrary(), telegram: undefined, sourceDir: "C:\\export" };
    addCards(lib, messagesToCards([msg(1, { text: "a" }), msg(2, { text: "b" })]));
    const chat = fakeChat(4);
    const r = await syncSaved(lib, deps(chat.tg));
    expect(chat.calls[0]).toEqual([0, 2]);
    expect(r.added).toBe(2);
  });

  it("waits out FLOOD_WAIT and retries", async () => {
    const chat = fakeChat(2);
    let flooded = false;
    const slept: number[] = [];
    const tg: SyncDeps["tg"] = {
      ...chat.tg,
      savedPage: async (o, m) => {
        if (!flooded) {
          flooded = true;
          throw "FLOOD_WAIT:3";
        }
        return chat.tg.savedPage(o, m);
      },
    };
    const r = await syncSaved(emptyTelegramLibrary(), { ...deps(tg), sleep: async (ms) => void slept.push(ms) });
    expect(slept).toEqual([3500]);
    expect(r.added).toBe(2);
  });
});

describe("albums across pages", () => {
  it("merges an album split over two history pages into one card", async () => {
    const date = 1_700_000_000;
    const g = { groupedId: "777", date };
    const pages: SavedPage[] = [
      { messages: [msg(103, { ...g, media: { kind: "photo" } }), msg(102, { ...g, media: { kind: "photo" } })], nextOffset: 102, total: 4 },
      { messages: [msg(101, { ...g, media: { kind: "photo" } }), msg(100, { ...g, text: "caption", media: { kind: "photo" } })], nextOffset: 100, total: 4 },
      { messages: [], nextOffset: null, total: 4 },
    ];
    const tg: SyncDeps["tg"] = {
      savedPage: async () => pages.shift()!,
      savedPhotos: async (batch) => batch.map((id) => ({ id, path: `/m/${id}.jpg` })),
    };
    const lib = emptyTelegramLibrary();
    const r = await syncSaved(lib, deps(tg));
    expect(lib.cards).toHaveLength(1);
    expect(r.added).toBe(1);
    const c = lib.cards[0];
    expect(c.text).toBe("caption");
    expect([c.id, ...(c.albumIds ?? [])].sort((a, b) => a - b)).toEqual([100, 101, 102, 103]);
    expect(c.album).toHaveLength(3);
    expect(r.photos).toBe(4);
  });

  it("merges album parts by groupedId even when the caption is not on the first message", () => {
    const g = { groupedId: "5" };
    const cards = messagesToCards([msg(11, { ...g, text: "late caption", media: { kind: "photo" } }), msg(10, { ...g, media: { kind: "photo" } })]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 10, text: "late caption", albumIds: [11] });
  });
});

describe("account switch", () => {
  it("refuses to mix another account's messages into the board, and changes nothing", async () => {
    const chat = fakeChat(4);
    const owner = { id: 1 };
    const tg: SyncDeps["tg"] = {
      ...chat.tg,
      savedPage: async (o, m) => ({ ...(await chat.tg.savedPage(o, m)), owner: owner.id }),
    };
    const lib = emptyTelegramLibrary();
    await syncSaved(lib, deps(tg));
    expect(lib.telegram).toMatchObject({ top: 4, owner: 1, noPhoto: [3] });
    const before = structuredClone(lib);
    owner.id = 2;
    await expect(syncSaved(lib, deps(tg))).rejects.toThrow("OTHER_ACCOUNT_LIBRARY");
    expect(lib).toEqual(before);
  });
});

describe("backupSaved", () => {
  it("steps until done and waits out FLOOD_WAIT", async () => {
    const steps = [{ done: false, saved: 100 }, "FLOOD_WAIT:2", { done: false, saved: 100 }, { done: true, saved: 7 }];
    const slept: number[] = [];
    const tg = {
      backupStep: async () => {
        const s = steps.shift();
        if (typeof s === "string") throw s;
        return s!;
      },
    };
    const n = await backupSaved({ tg, signal: new AbortController().signal, sleep: async (ms) => void slept.push(ms) });
    expect(n).toBe(207);
    expect(slept).toEqual([2500]);
    expect(steps).toEqual([]);
  });

  it("stops when asked", async () => {
    const ctl = new AbortController();
    let calls = 0;
    const tg = { backupStep: async () => (calls++, ctl.abort(), { done: false, saved: 1 }) };
    expect(await backupSaved({ tg, signal: ctl.signal })).toBe(1);
    expect(calls).toBe(1);
  });
});
