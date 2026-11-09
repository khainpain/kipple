import { describe, expect, it } from "vitest";
import type { TelegramApi, TagResult } from "../platform/types";
import type { Card } from "./types";
import { emptyTagSyncState, hashtagPlan, NoPremiumError, syncTags, tagPlan, topTags } from "./tgTags";

const card = (id: number, date: string, tags: string[], extra: Partial<Card> = {}): Card => ({
  id,
  date,
  kind: "text",
  text: `msg ${id}`,
  urls: [],
  hashtags: [],
  user: { tags },
  ...extra,
});

const cards = [
  card(1, "2026-01-01T00:00:00Z", ["design", "ux", "ideas", "fonts"]),
  card(2, "2026-02-01T00:00:00Z", ["design", "food"]),
  card(3, "2026-03-01T00:00:00Z", ["ux"], { forwardedFrom: "Channel" }),
  card(4, "2026-04-01T00:00:00Z", ["design"], { removed: true }),
];

describe("topTags", () => {
  it("picks the most used tags of the cards still in play", () => {
    expect(topTags(cards, 2)).toEqual(["design", "ux"]);
  });
});

describe("tagPlan", () => {
  it("gives each message up to three of the usable tags and skips what's already there", () => {
    const usable = new Set(["design", "ux", "ideas", "fonts", "food"]);
    const state = { ...emptyTagSyncState(), tags: { "2": { titles: ["food", "design"], reactions: ["🍔", "🎨"] } } };
    expect(tagPlan(cards, state, usable)).toEqual([
      { cardId: 1, date: 1767225600, want: ["design", "ux", "ideas"] },
      { cardId: 3, date: 1772323200, want: ["ux"] },
    ]);
  });

  it("takes Kipple's tags off a card whose tags were removed", () => {
    const state = { ...emptyTagSyncState(), tags: { "2": { titles: ["food"], reactions: ["🍔"] } } };
    expect(tagPlan([card(2, "2026-02-01T00:00:00Z", [])], state, new Set(["food"]))).toEqual([{ cardId: 2, date: 1769904000, want: [] }]);
  });
});

describe("hashtagPlan", () => {
  it("adds hashtags only to own messages, without ones the text or an earlier run has", () => {
    const own = card(5, "2026-05-01T00:00:00Z", ["Read later", "design", "ux"], { hashtags: ["Design"] });
    const state = { ...emptyTagSyncState(), hashtags: { "5": ["#ux"] } };
    expect(hashtagPlan([...cards, own], state)).toEqual([
      { cardId: 1, date: 1767225600, want: ["#design", "#ux", "#ideas", "#fonts"] },
      { cardId: 2, date: 1769904000, want: ["#design", "#food"] },
      { cardId: 5, date: 1777593600, want: ["#read_later"] },
    ]);
  });
});

function fakeTg(opts: { premium?: boolean; results?: Record<number, TagResult["status"]> } = {}) {
  const log: string[] = [];
  const tg = {
    tagsSetup: async (titles: string[]) => ({
      premium: opts.premium ?? true,
      owner: 42,
      // Pretend Telegram only had emoji for three tags.
      tags: (opts.premium ?? true ? titles.slice(0, 3) : []).map((title, i) => ({ title, reaction: ["🎨", "🧭", "💡"][i] })),
    }),
    tagsApply: async (id: number, _date: number, owner: number, add: string[], remove: string[]) => {
      log.push(`tags ${id}@${owner} +${add.join("")} -${remove.join("")}`);
      const status = opts.results?.[id] ?? "ok";
      return { status, applied: status === "ok" ? add : [] };
    },
    tagsHashtags: async (id: number, _date: number, _owner: number, hashtags: string[]) => {
      log.push(`hashtags ${id} ${hashtags.join(" ")}`);
      return { status: opts.results?.[id] ?? "ok", applied: hashtags };
    },
  } as unknown as TelegramApi;
  return { tg, log };
}

const noSleep = async () => undefined;

describe("syncTags", () => {
  it("puts Telegram tags on messages and only redoes cards that changed", async () => {
    const { tg, log } = fakeTg();
    const state = emptyTagSyncState();
    const saves: string[] = [];
    const res = await syncTags(cards, state, "tags", { tg, save: async (s) => void saves.push(JSON.stringify(s)), onProgress: () => {}, sleep: noSleep });
    expect(log).toEqual(["tags 1@42 +🎨🧭💡 -", "tags 2@42 +🎨 -", "tags 3@42 +🧭 -"]);
    expect(res).toEqual({ done: 3, total: 3, skipped: 0 });
    expect(state.owner).toBe(42);
    expect(state.tags["2"]).toEqual({ titles: ["design"], reactions: ["🎨"] });
    expect(saves).toHaveLength(3);

    // The user drops "design" from card 2: Kipple takes its tag off, nothing else is touched.
    log.length = 0;
    const edited = cards.map((c) => (c.id === 2 ? { ...c, user: { tags: ["food"] } } : c));
    await syncTags(edited, state, "tags", { tg, save: async () => {}, onProgress: () => {}, sleep: noSleep });
    expect(log).toEqual(["tags 2@42 + -🎨"]);
    expect(state.tags["2"]).toBeUndefined();
  });

  it("asks for Premium before touching anything", async () => {
    const { tg, log } = fakeTg({ premium: false });
    await expect(syncTags(cards, emptyTagSyncState(), "tags", { tg, save: async () => {}, onProgress: () => {}, sleep: noSleep })).rejects.toBeInstanceOf(NoPremiumError);
    expect(log).toEqual([]);
  });

  it("starts over for another account", async () => {
    const { tg } = fakeTg();
    const state = { owner: 7, tags: { "1": { titles: ["design", "ux", "ideas"], reactions: ["x"] } }, hashtags: {} };
    await syncTags(cards, state, "tags", { tg, save: async () => {}, onProgress: () => {}, sleep: noSleep });
    expect(state.owner).toBe(42);
    expect(state.tags["1"].reactions).toEqual(["🎨", "🧭", "💡"]);
  });

  it("adds hashtags, counts skipped messages and doesn't retry ones that can't take them", async () => {
    const { tg, log } = fakeTg({ results: { 2: "not_editable" } });
    const state = emptyTagSyncState();
    const res = await syncTags(cards, state, "hashtags", { tg, save: async () => {}, onProgress: () => {}, sleep: noSleep });
    expect(log).toEqual(["hashtags 1 #design #ux #ideas #fonts", "hashtags 2 #design #food"]);
    expect(res).toEqual({ done: 2, total: 2, skipped: 1 });
    log.length = 0;
    await syncTags(cards, state, "hashtags", { tg, save: async () => {}, onProgress: () => {}, sleep: noSleep });
    expect(log).toEqual([]);
  });

  it("waits out a rate limit and carries on", async () => {
    const { tg, log } = fakeTg();
    let flooded = false;
    const apply = tg.tagsApply;
    tg.tagsApply = async (...a) => {
      if (!flooded) {
        flooded = true;
        throw "FLOOD_WAIT:3";
      }
      return apply(...a);
    };
    const waits: number[] = [];
    await syncTags(cards, emptyTagSyncState(), "tags", { tg, save: async () => {}, onProgress: (p) => p.waitSeconds && waits.push(p.waitSeconds), sleep: noSleep });
    expect(waits).toEqual([3]);
    expect(log).toHaveLength(3);
  });
});
