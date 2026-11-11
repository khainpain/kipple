import { describe, expect, it } from "vitest";
import type { Card } from "./types";
import { applyEdits, effectiveAction, makeEdit, patchUser } from "./library";
import { CHANNEL_MIN, breakdown, decide, restore, type Pile } from "./cleanup";
import logicSource from "./cleanup.ts?raw";
import screenSource from "../components/Cleanup.tsx?raw";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const card = (id: number, over: Partial<Card> = {}): Card => ({ id, date: "2026-06-01T10:00:00Z", kind: "link", text: `card ${id}`, urls: [], hashtags: [], ...over });
const many = (n: number, from: number, over: (i: number) => Partial<Card>) => Array.from({ length: n }, (_, i) => card(from + i, over(from + i)));
const pileOf = (cards: Card[], key: string): Pile | undefined => breakdown(cards, NOW).piles.find((p) => p.key === key);
const ids = (p: Pile | undefined) => p?.cards.map((c) => c.id).sort((a, b) => a - b);

/** A library shaped like a real archive: every kind of card the screen sorts, in bulk. */
function archive(n: number): Card[] {
  const out: Card[] = [];
  for (let i = 1; i <= n; i++) {
    const k = i % 20;
    const c = card(i, { date: new Date(NOW - (i % 1500) * 864e5).toISOString() });
    if (k === 0) Object.assign(c, { kind: "sticker", text: "", autoJunk: true });
    else if (k === 1) Object.assign(c, { kind: "text", text: "ok", autoJunk: true });
    else if (k === 2) Object.assign(c, { urls: [`https://dupe.example/p${i % 40}`] });
    else if (k <= 5) Object.assign(c, { forwardedFrom: `Channel ${i % 7}`, text: `post ${i}` });
    else if (k <= 8) Object.assign(c, { urls: [`https://site${i % 9}.example/a${i}`] });
    else if (k === 9) Object.assign(c, { kind: "photo", text: "" });
    else if (k === 10) Object.assign(c, { kind: "video", text: "" });
    else if (k === 11) Object.assign(c, { kind: "document", text: "", media: { fileName: `f${i}.pdf`, size: i } });
    else if (k === 12) Object.assign(c, { kind: "voice", text: "" });
    else if (k === 13) Object.assign(c, { kind: "text", text: `my own note number ${i}` });
    else if (k === 14) Object.assign(c, { kind: "text", text: "password: hunter2hunter2", sensitive: true });
    else if (k === 15) Object.assign(c, { user: { action: "junk" } });
    else if (k === 16) Object.assign(c, { user: { topic: "Travel" } });
    else if (k === 17) Object.assign(c, { user: { kept: true } });
    else if (k === 18) Object.assign(c, { removed: true });
    else Object.assign(c, { kind: "photo", text: `captioned ${i}` });
    out.push(c);
  }
  return out;
}

describe("breakdown", () => {
  it("accounts for every card: piles, sorted and sensitive add up to the total", () => {
    const cards = archive(2000);
    const b = breakdown(cards, NOW);
    const inPiles = b.piles.reduce((n, p) => n + p.cards.length, 0);
    expect(b.total).toBe(cards.filter((c) => !c.removed).length);
    expect(inPiles + b.sorted.kept + b.sorted.topics + b.sorted.junk + b.sensitive).toBe(b.total);
    // …and no card is counted twice.
    expect(new Set(b.piles.flatMap((p) => p.cards.map((c) => c.id))).size).toBe(inPiles);
  });

  it("puts a card into the first pile that fits, in the order of the brief", () => {
    const cards = [
      // Rule-guessed junk that is also a repeat and from a channel: junk wins.
      ...many(2, 1, () => ({ kind: "sticker", text: "", autoJunk: true, forwardedFrom: "News" })),
      // The same link twice from a channel: duplicates win over the channel.
      ...many(2, 10, () => ({ urls: ["https://a.example/same"], forwardedFrom: "News" })),
      // A channel wins over the site of its links.
      ...many(CHANNEL_MIN, 20, (i) => ({ urls: [`https://b.example/${i}`], forwardedFrom: "News" })),
      ...many(CHANNEL_MIN, 30, (i) => ({ urls: [`https://b.example/x${i}`] })),
    ];
    const b = breakdown(cards, NOW);
    expect(b.piles.map((p) => [p.key, p.cards.length])).toEqual([
      ["junk", 2],
      ["dupes", 2],
      ["ch:News", CHANNEL_MIN],
      ["site:b.example", CHANNEL_MIN],
    ]);
  });

  it("never puts a sensitive card into a pile, whatever else it looks like", () => {
    const cards = [
      ...many(6, 1, () => ({ sensitive: true, forwardedFrom: "Keys", urls: ["https://k.example/same"] })),
      card(10, { sensitive: true, kind: "sticker", text: "", autoJunk: true }),
      card(11, { sensitive: true, date: "2019-01-01T00:00:00Z" }),
    ];
    const b = breakdown(cards, NOW);
    expect(b.piles).toEqual([]);
    expect(b.sensitive).toBe(7);
    // Rule-guessed junk that looks sensitive is already in Junk on the board; it stays out of the bulk pile.
    expect(b.sorted.junk).toBe(1);
  });

  it("makes a channel or site pile only from five cards up, biggest first", () => {
    const cards = [
      ...many(4, 1, () => ({ forwardedFrom: "Small" })),
      ...many(5, 10, () => ({ forwardedFrom: "Five" })),
      ...many(7, 20, () => ({ forwardedFrom: "Seven" })),
      ...many(4, 30, (i) => ({ urls: [`https://few.example/${i}`] })),
      ...many(6, 40, (i) => ({ urls: [`https://www.many.example/${i}`] })),
    ];
    const keys = breakdown(cards, NOW).piles.map((p) => p.key);
    expect(keys).toEqual(["ch:Seven", "ch:Five", "site:many.example", "rest"]);
    expect(pileOf(cards, "rest")?.cards.length).toBe(8);
  });

  it("piles media by type only when it has no caption", () => {
    const cards = [
      card(1, { kind: "photo", text: "" }),
      card(2, { kind: "photo", text: "the receipt" }),
      card(3, { kind: "video", text: " " }),
      card(4, { kind: "video_note", text: "" }),
      card(5, { kind: "document", text: "" }),
      card(6, { kind: "voice", text: "" }),
      card(7, { kind: "audio", text: "" }),
    ];
    const b = breakdown(cards, NOW);
    expect(b.piles.map((p) => [p.key, ids(p)])).toEqual([
      ["photos", [1]],
      ["videos", [3, 4]],
      ["files", [5]],
      ["audio", [6, 7]],
      ["rest", [2]],
    ]);
  });

  it("calls old what is over two years old and fits no pile above", () => {
    const cards = [
      card(1, { date: "2024-11-10T00:00:00Z" }),
      card(2, { date: "2024-11-12T00:00:00Z" }),
      card(3, { date: "2020-01-01T00:00:00Z", kind: "photo", text: "" }),
    ];
    expect(ids(pileOf(cards, "old"))).toEqual([1]);
    expect(ids(pileOf(cards, "photos"))).toEqual([3]);
  });

  it("calls a note what the person wrote themselves: text, no link, not forwarded", () => {
    const cards = [
      card(1, { kind: "text", text: "buy milk and bread" }),
      card(2, { kind: "text", text: "see https://x.example", urls: ["https://x.example"] }),
      card(3, { kind: "text", text: "a forwarded thought", forwardedFrom: "Friend" }),
    ];
    expect(ids(pileOf(cards, "notes"))).toEqual([1]);
    expect(ids(pileOf(cards, "rest"))).toEqual([2, 3]);
  });

  it("counts as sorted what already has a decision: junk, a topic, or kept", () => {
    const ai = { title: "", summary: "", topic: "Dev", tags: [], action: "junk" as const, priority: 2 as const, model: "m", at: "t" };
    const cards = [
      card(1, { user: { action: "junk" } }),
      card(2, { user: { action: "junk", topic: "Dev", kept: true } }),
      card(3, { ai }), // the AI called it junk: it is in Junk on the board already
      card(4, { user: { topic: "Dev" } }),
      card(5, { ai: { ...ai, action: "reference" } }),
      card(6, { user: { topic: "Dev", kept: true } }),
      card(7, { user: { kept: true } }),
      card(8, { user: { hidden: true } }),
      card(9, { removed: true, user: { kept: true } }),
    ];
    const b = breakdown(cards, NOW);
    expect(b.sorted).toEqual({ junk: 3, topics: 3, kept: 2 });
    expect(b.total).toBe(8);
    expect(b.piles).toEqual([]);
  });

  it("offers rule-guessed junk until the person decides, and not again after they took it out", () => {
    const cards = [card(1, { kind: "text", text: "ok", autoJunk: true }), card(2, { kind: "text", text: "ok", autoJunk: true, user: { kept: true } })];
    const b = breakdown(cards, NOW);
    expect(ids(b.piles.find((p) => p.key === "junk"))).toEqual([1]);
    expect(b.sorted.kept).toBe(1);
  });

  it("looks for duplicates only among cards still to sort", () => {
    const cards = [card(1, { urls: ["https://a.example/x"], user: { topic: "Dev" } }), card(2, { urls: ["https://a.example/x"] }), card(3, { urls: ["https://b.example/y"] }), card(4, { urls: ["https://b.example/y?utm_source=tg"] })];
    expect(ids(pileOf(cards, "dupes"))).toEqual([3, 4]);
  });

  it("says since which year the archive goes", () => {
    expect(breakdown([card(1, { date: "2019-05-01T00:00:00Z" }), card(2), card(3, { date: "2015-01-01T00:00:00Z", removed: true })], NOW).since).toBe(2019);
    expect(breakdown([], NOW).since).toBeUndefined();
  });

  it("sorts a 2,000-card archive well within a second", () => {
    const cards = archive(2000);
    breakdown(cards, NOW); // warm-up
    const t = performance.now();
    breakdown(cards, NOW);
    expect(performance.now() - t).toBeLessThan(250);
  });
});

describe("decide", () => {
  const five = (over: Partial<Card> = {}) => many(CHANNEL_MIN, 1, () => ({ forwardedFrom: "News", ...over }));

  it("keeps a pile by marking its cards, so they stay on the board and leave the screen", () => {
    const cards = five();
    const edits = decide(pileOf(cards, "ch:News")!, "keep");
    expect(edits).toEqual([{ ids: [1, 2, 3, 4, 5], patch: { kept: true } }]);
  });

  it("takes rule-guessed junk out of Junk when it is kept, without giving it a status", () => {
    const cards = [card(1, { kind: "sticker", text: "", autoJunk: true })];
    expect(effectiveAction(cards[0])).toBe("junk");
    const edits = decide(pileOf(cards, "junk")!, "keep");
    expect(edits).toEqual([{ ids: [1], patch: { kept: true } }]);
    const [kept] = applyEdits(cards, [makeEdit(1, edits[0].patch)]);
    expect(effectiveAction(kept)).toBeUndefined();
    expect(breakdown([kept], NOW).sorted).toEqual({ kept: 1, topics: 0, junk: 0 });
  });

  it("sends a pile to a topic or to junk inside Kipple", () => {
    const pile = pileOf(five(), "ch:News")!;
    expect(decide(pile, "topic", "Reading")).toEqual([{ ids: [1, 2, 3, 4, 5], patch: { topic: "Reading" } }]);
    expect(decide(pile, "junk")).toEqual([{ ids: [1, 2, 3, 4, 5], patch: { action: "junk" } }]);
    expect(decide(pile, "topic", " ")).toEqual([]);
  });

  it("keeps one of each duplicate: the fullest, or the earliest when they are the same", () => {
    const cards = [
      card(1, { urls: ["https://a.example/x"], text: "https://a.example/x", date: "2026-03-01T00:00:00Z" }),
      card(2, { urls: ["https://a.example/x"], text: "https://a.example/x", date: "2026-01-01T00:00:00Z" }),
      card(3, { urls: ["https://a.example/x"], text: "https://a.example/x", date: "2026-02-01T00:00:00Z" }),
      card(4, { urls: ["https://b.example/y"], text: "https://b.example/y", date: "2026-01-01T00:00:00Z" }),
      card(5, { urls: ["https://b.example/y"], text: "https://b.example/y for the trip in May", date: "2026-02-01T00:00:00Z" }),
      card(6, { urls: ["https://c.example/z"], text: "z", date: "2026-01-01T00:00:00Z" }),
      card(7, { urls: ["https://c.example/z"], text: "z", date: "2026-02-01T00:00:00Z", user: { note: "ask Anna about this" } }),
    ];
    const edits = decide(pileOf(cards, "dupes")!, "keepOne");
    expect(edits).toEqual([{ ids: [1, 3, 4, 6], patch: { action: "junk" } }]);
  });

  it("can be taken back exactly: the cards return to the pile they were in", () => {
    const cards = [card(1, { kind: "sticker", text: "", autoJunk: true }), card(2, { kind: "text", text: "ok", autoJunk: true })];
    const shape = (cs: Card[]) => {
      const b = breakdown(cs, NOW);
      return { ...b, piles: b.piles.map((p) => [p.key, ids(p)]) };
    };
    const before = breakdown(cards, NOW);
    for (const how of ["junk", "keep"] as const) {
      const edits = decide(before.piles[0], how);
      const undo = restore(cards, edits);
      // Applied and undone the way the app does it: in memory and through the edit log.
      const log = [...edits, ...undo].flatMap((e) => e.ids.map((id) => makeEdit(id, e.patch)));
      const replayed = applyEdits(structuredClone(cards), JSON.parse(JSON.stringify(log)));
      expect(shape(replayed)).toEqual(shape(cards));
    }
  });

  it("puts back a topic or status the card had before", () => {
    const cards = [...five({ user: { action: "idea" } }), card(9, { forwardedFrom: "News" })];
    const edits = decide(pileOf(cards, "ch:News")!, "junk");
    expect(restore(cards, edits)).toEqual([
      { ids: [1, 2, 3, 4, 5], patch: { action: "idea" } },
      { ids: [9], patch: { action: null } },
    ]);
  });
});

describe("Telegram", () => {
  it("is out of reach: a decision is only an edit to Kipple's own fields", () => {
    const cards = archive(400);
    for (const pile of breakdown(cards, NOW).piles)
      for (const how of ["keep", "topic", "junk", "keepOne"] as const)
        for (const e of decide(pile, how, "Topic")) expect(Object.keys(e.patch).filter((k) => !["action", "topic", "kept"].includes(k))).toEqual([]);
    // Neither the screen nor its logic imports the platform layer or any Telegram code.
    for (const src of [logicSource, screenSource]) expect(src).not.toMatch(/from\s+"[^"]*(@platform|platform\/|telegram|\/tg[A-Z])[^"]*"/i);
  });
});

describe("patchUser", () => {
  it("clears a field when the patch says null, and leaves the rest", () => {
    expect(patchUser({ topic: "Dev", kept: true }, { topic: null, action: "junk" })).toEqual({ kept: true, action: "junk" });
    expect(patchUser(undefined, { kept: null })).toEqual({});
  });

  it("is what replaying the edit log uses", () => {
    const [c] = applyEdits([card(1, { user: { action: "junk", note: "n" } })], [makeEdit(1, { action: null })]);
    expect(c.user).toEqual({ note: "n" });
  });
});
