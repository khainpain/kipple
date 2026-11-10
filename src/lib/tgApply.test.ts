import { describe, expect, it } from "vitest";
import type { TelegramApi } from "../platform/types";
import type { Card } from "./types";
import { applyToTelegram, deletePlan, deleteWithFiles, emptyPinState, pinPlan } from "./tgApply";

const card = (id: number, date: string, extra: Partial<Card> = {}): Card => ({
  id,
  date,
  kind: "text",
  text: `msg ${id}`,
  urls: [],
  hashtags: [],
  ...extra,
});

const JAN = "2026-01-01T00:00:00Z"; // 1767225600
const FEB = "2026-02-01T00:00:00Z"; // 1769904000

describe("deletePlan", () => {
  it("deletes only what the user sent to junk, never a guess by the rules or the AI", () => {
    const cards = [
      card(1, JAN, { user: { action: "junk" } }),
      card(2, JAN, { autoJunk: true }),
      card(3, JAN, { ai: { action: "junk" } as Card["ai"] }),
      card(4, JAN, { user: { action: "idea" } }),
    ];
    expect(deletePlan(cards).map((d) => d.cardId)).toEqual([1]);
  });

  it("skips cards already gone and takes every message of an album", () => {
    const cards = [
      card(1, JAN, { user: { action: "junk" }, removed: true }),
      card(2, FEB, { user: { action: "junk" }, kind: "photo", albumIds: [3, 4] }),
    ];
    expect(deletePlan(cards)).toEqual([{ cardId: 2, ids: [2, 3, 4], date: 1769904000 }]);
  });

  it("counts junk cards whose files the text-only backup can't keep", () => {
    const cards = [
      card(1, JAN, { user: { action: "junk" } }),
      card(2, JAN, { user: { action: "junk" }, kind: "document", media: { inTelegram: true } }),
      card(3, JAN, { user: { action: "junk" }, kind: "photo", album: [{ inTelegram: true }] }),
      card(4, JAN, { kind: "video", media: { inTelegram: true } }),
      card(5, JAN, { user: { action: "junk" }, media: {}, removed: true }),
      card(6, JAN, { user: { action: "junk" }, kind: "poll", media: {} }),
      card(7, JAN, { user: { action: "junk" }, kind: "photo", media: { path: "C:/kipple/photos/7.jpg", inTelegram: true } }),
    ];
    expect(deleteWithFiles(cards)).toBe(2);
  });
});

describe("pinPlan", () => {
  it("pins important cards and unpins only what Kipple pinned before", () => {
    const cards = [
      card(1, JAN, { user: { pinned: true } }),
      card(2, JAN, { ai: { priority: 1 } as Card["ai"] }),
      card(3, FEB, { user: { pinned: false } }),
      card(4, FEB),
      card(5, FEB, { user: { pinned: true } }),
    ];
    const state = { ...emptyPinState(), pinned: [3, 5] };
    expect(pinPlan(cards, state)).toEqual([
      { cardId: 1, date: 1767225600, pin: true },
      { cardId: 2, date: 1767225600, pin: true },
      { cardId: 3, date: 1769904000, pin: false },
    ]);
  });

  it("doesn't pin junk or removed cards", () => {
    const cards = [card(1, JAN, { user: { pinned: true, action: "junk" } }), card(2, JAN, { user: { pinned: true }, removed: true })];
    expect(pinPlan(cards, emptyPinState())).toEqual([]);
  });
});

function fakeTg(over: Partial<TelegramApi> = {}) {
  const calls: string[] = [];
  const tg = {
    deleteCards: async (items: Array<{ id: number; date: number }>, whole: boolean) => {
      calls.push(`delete ${items.map((i) => i.id).join(",")}${whole ? " whole" : ""}`);
      return items.map((i) => ({ id: i.id, status: i.id === 9 ? ("changed" as const) : i.id === 8 ? ("missing" as const) : ("deleted" as const) }));
    },
    pinSaved: async (id: number, _date: number, pin: boolean) => {
      calls.push(`${pin ? "pin" : "unpin"} ${id}`);
      return "ok" as const;
    },
    account: async () => ({ name: "Me", id: 77 }),
    ...over,
  } as unknown as TelegramApi;
  return { tg, calls };
}

const noSleep = async () => {};

describe("applyToTelegram", () => {
  it("deletes junk, marks only the deleted cards as removed and pins important ones", async () => {
    const cards = [
      card(1, JAN, { user: { action: "junk" }, kind: "photo", albumIds: [2] }),
      card(9, JAN, { user: { action: "junk" } }),
      card(5, FEB, { user: { pinned: true } }),
    ];
    const { tg, calls } = fakeTg();
    const state = emptyPinState();
    const saved: number[][] = [];
    const res = await applyToTelegram(cards, state, { deleteJunk: true, pins: true }, {
      tg,
      saveCards: async () => void saved.push(cards.filter((c) => c.removed).map((c) => c.id)),
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(calls).toEqual(["delete 1,2 whole", "delete 9", "pin 5"]);
    expect(cards.map((c) => !!c.removed)).toEqual([true, false, false]);
    expect(saved[0]).toEqual([1]);
    expect(state.pinned).toEqual([5]);
    expect(res).toMatchObject({ deleted: 1, pinned: 1, unpinned: 0, skipped: 1 });
  });

  it("tells Telegram which account the library belongs to, and stops on another one", async () => {
    const cards = [card(3, JAN, { user: { action: "junk" } })];
    const owners: Array<number | undefined> = [];
    const { tg } = fakeTg({
      deleteCards: (async (_items: unknown, _whole: boolean, owner?: number) => {
        owners.push(owner);
        throw new Error("OTHER_ACCOUNT_LIBRARY");
      }) as TelegramApi["deleteCards"],
    });
    const run = applyToTelegram(cards, emptyPinState(), { deleteJunk: true, pins: false }, {
      tg,
      owner: 42,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    await expect(run).rejects.toThrow("OTHER_ACCOUNT_LIBRARY");
    expect(owners).toEqual([42]);
    expect(cards[0].removed).toBeFalsy();
  });

  it("keeps a card whose album was only partly deleted", async () => {
    const cards = [card(1, JAN, { user: { action: "junk" }, kind: "photo", albumIds: [9] })];
    const { tg } = fakeTg();
    const res = await applyToTelegram(cards, emptyPinState(), { deleteJunk: true, pins: false }, {
      tg,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(cards[0].removed).toBeFalsy();
    expect(res.skipped).toBe(1);
  });

  it("counts a message already gone (say, deleted by a retried call) as deleted", async () => {
    const cards = [card(8, JAN, { user: { action: "junk" } })];
    const { tg } = fakeTg();
    const res = await applyToTelegram(cards, emptyPinState(), { deleteJunk: true, pins: false }, {
      tg,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(cards[0].removed).toBe(true);
    expect(res).toMatchObject({ deleted: 1, skipped: 0 });
  });

  it("never takes over a pin the user made in Telegram", async () => {
    const cards = [card(5, FEB, { user: { pinned: true } }), card(6, FEB, { user: { pinned: true } })];
    const { tg } = fakeTg({ pinSaved: async (id: number) => (id === 5 ? "same" : "refused") } as Partial<TelegramApi>);
    const state = emptyPinState();
    const res = await applyToTelegram(cards, state, { deleteJunk: false, pins: true }, {
      tg,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(state.pinned).toEqual([]);
    expect(res).toMatchObject({ pinned: 0, skipped: 1 });
  });

  it("forgets a pin when the message is gone, keeps it when another account answered", async () => {
    const cards = [card(3, JAN), card(4, JAN)];
    const { tg } = fakeTg({
      pinSaved: async (id: number) => (id === 3 ? "missing" : "changed"),
    } as Partial<TelegramApi>);
    const state = { owner: 77, pinned: [3, 4] };
    await applyToTelegram(cards, state, { deleteJunk: false, pins: true }, {
      tg,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(state.pinned).toEqual([4]);
  });

  it("starts the pin list over for another account", async () => {
    const cards = [card(5, FEB, { user: { pinned: true } })];
    const { tg } = fakeTg();
    const state = { owner: 1, pinned: [3] };
    await applyToTelegram(cards, state, { deleteJunk: false, pins: true }, {
      tg,
      saveCards: async () => {},
      savePins: async () => {},
      onProgress: () => {},
      sleep: noSleep,
    });
    expect(state).toEqual({ owner: 77, pinned: [5] });
  });
});
