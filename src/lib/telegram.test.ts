import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import type { TelegramApi } from "../platform/types";
import type { Card } from "./types";
import { buildPlan, emptyBoardState, hashtag, noteFor, otherTopic, sendToTelegram, type BoardState } from "./telegram";

const ai = (topic: string, extra: Partial<NonNullable<Card["ai"]>> = {}): Card["ai"] => ({
  title: "Заголовок",
  summary: "Коротко о главном.",
  topic,
  tags: ["дизайн", "ux"],
  action: "read_later",
  priority: 2,
  model: "test",
  at: "2026-01-01",
  ...extra,
});

// Expectations below are written for the Russian interface.
beforeEach(() => setLang("ru"));

const card = (id: number, date: string, extra: Partial<Card> = {}): Card => ({ id, date, kind: "text", text: `msg ${id}`, urls: [], hashtags: [], ...extra });

describe("hashtag", () => {
  it("makes Telegram-friendly hashtags", () => {
    expect(hashtag("Прочитать позже")).toBe("#прочитать_позже");
    expect(hashtag("UI/UX")).toBe("#ui_ux");
    expect(hashtag("c++")).toBe("#c");
    expect(hashtag("2024")).toBeNull();
    expect(hashtag("  ")).toBeNull();
  });
});

describe("noteFor", () => {
  it("puts a bold title, the summary and hashtags", () => {
    const n = noteFor(card(1, "2026-01-01", { ai: ai("Дизайн"), hashtags: ["ux"] }));
    expect(n.note).toBe("Заголовок\nКоротко о главном.\n#дизайн #прочитать_позже");
    expect(n.boldLen).toBe("Заголовок".length);
  });

  it("is empty for a card with nothing to say", () => {
    expect(noteFor(card(1, "2026-01-01"))).toEqual({ note: "", boldLen: 0 });
  });

  it("uses the user's own topic, tags and note", () => {
    const n = noteFor(card(1, "2026-01-01", { ai: ai("Дизайн"), user: { tags: ["своё"], note: "важно", action: "idea" } }));
    expect(n.note).toContain("Заметка: важно");
    expect(n.note).toContain("#своё #идея");
    expect(n.note).not.toContain("#дизайн");
  });
});

describe("buildPlan", () => {
  const cards = [
    card(3, "2026-03-01", { ai: ai("дизайн") }),
    card(1, "2026-01-01", { ai: ai("Дизайн"), albumIds: [2] }),
    card(4, "2026-04-01", { ai: ai("Еда", { action: "junk" }) }),
    card(5, "2026-05-01", { sensitive: true }),
    card(6, "2026-06-01", { removed: true }),
    card(7, "2026-07-01"),
  ];

  it("skips junk, sensitive and removed cards, oldest first, albums together", () => {
    const plan = buildPlan(cards, emptyBoardState(), { includeJunk: false, includeSensitive: false });
    expect(plan.map((p) => p.cardId)).toEqual([1, 3, 7]);
    expect(plan[0].msgIds).toEqual([1, 2]);
    expect(plan[0].topic).toBe("Дизайн");
    expect(plan[1].topic).toBe("Дизайн");
    expect(plan[2].topic).toBe(otherTopic());
  });

  it("includes junk and sensitive when asked", () => {
    const plan = buildPlan(cards, emptyBoardState(), { includeJunk: true, includeSensitive: true });
    expect(plan.map((p) => p.cardId)).toEqual([1, 3, 4, 5, 7]);
  });

  it("skips cards already sent or missing", () => {
    const state: BoardState = { ...emptyBoardState(), sent: { "1": 100 }, missing: [3] };
    expect(buildPlan(cards, state, { includeJunk: false, includeSensitive: false }).map((p) => p.cardId)).toEqual([7]);
  });
});

function fakeTg(opts: { floodOnce?: boolean; missing?: number[] } = {}) {
  const log: string[] = [];
  let nextMsg = 1000;
  let nextTopic = 10;
  let flooded = false;
  const tg: TelegramApi = {
    status: async () => ({ hasApi: true, builtInApi: true, customApi: false, authorized: true, name: "Me" }),
    account: async () => ({ name: "Me" }),
    savedPage: async () => ({ messages: [], nextOffset: null, total: 0 }),
    quoteSaved: async () => ({ id: 1, open: null, owner: null }),
    deleteSaved: async () => undefined,
    savedPhotos: async () => [],
    forgetMedia: async () => undefined,
    setApi: async () => undefined,
    clearApi: async () => undefined,
    requestCode: async () => undefined,
    signIn: async () => ({ status: "ok", name: "Me" }),
    checkPassword: async () => ({ status: "ok", name: "Me" }),
    qrPoll: async () => ({ status: "ok", name: "Me" }),
    qrCancel: async () => undefined,
    logout: async () => undefined,
    ensureBoard: async (prev) => (log.push(`board ${prev ? "reuse" : "new"}`), { channelId: 1, accessHash: "-123", created: !prev }),
    createTopic: async (_b, title) => (log.push(`topic ${title}`), nextTopic++),
    forward: async (_b, topic, ids) => {
      if (opts.floodOnce && !flooded) {
        flooded = true;
        throw "FLOOD_WAIT:3";
      }
      if (opts.missing?.includes(ids[0])) return [];
      log.push(`fwd ${ids.join(",")} -> ${topic}`);
      return ids.map(() => nextMsg++);
    },
    sendNote: async (_b, topic, replyTo) => (log.push(`note ${replyTo} in ${topic}`), nextMsg++),
  };
  return { tg, log };
}

describe("sendToTelegram", () => {
  const cards = [card(1, "2026-01-01", { ai: ai("Дизайн") }), card(2, "2026-02-01", { ai: ai("Еда") }), card(3, "2026-03-01", { ai: ai("Дизайн") })];
  const opts = { includeJunk: false, includeSensitive: false };
  const sleeps: number[] = [];
  const sleep = async (ms: number) => void sleeps.push(ms);

  it("creates the group and topics, forwards each card with a note, and remembers it", async () => {
    const { tg, log } = fakeTg();
    const state = emptyBoardState();
    const res = await sendToTelegram(cards, state, opts, { tg, save: async () => undefined, onProgress: () => undefined, sleep });
    expect(res).toMatchObject({ done: 3, total: 3, missing: 0 });
    expect(log).toEqual(["board new", "topic Дизайн", "fwd 1 -> 10", "note 1000 in 10", "topic Еда", "fwd 2 -> 11", "note 1002 in 11", "fwd 3 -> 10", "note 1004 in 10"]);
    expect(state.sent).toEqual({ "1": 1000, "2": 1002, "3": 1004 });
    expect(state.board?.accessHash).toBe("-123");

    // A second run sends only the new card and reuses the group and topics.
    const again = fakeTg();
    const more = [...cards, card(4, "2026-04-01", { ai: ai("Еда") })];
    await sendToTelegram(more, state, opts, { tg: again.tg, save: async () => undefined, onProgress: () => undefined, sleep });
    expect(again.log).toEqual(["board reuse", "fwd 4 -> 11", "note 1000 in 11"]);
  });

  it("waits out rate limits and records missing originals", async () => {
    const { tg } = fakeTg({ floodOnce: true, missing: [2] });
    const state = emptyBoardState();
    const waits: Array<number | undefined> = [];
    sleeps.length = 0;
    const res = await sendToTelegram(cards, state, opts, { tg, save: async () => undefined, onProgress: (p) => waits.push(p.waitSeconds), sleep });
    expect(res).toMatchObject({ done: 3, missing: 1 });
    expect(waits).toContain(3);
    expect(sleeps).toContain(4000);
    expect(state.missing).toEqual([2]);
  });

  it("stops when aborted and resumes later", async () => {
    const { tg } = fakeTg();
    const state = emptyBoardState();
    const ctl = new AbortController();
    await sendToTelegram(cards, state, opts, {
      tg,
      save: async () => undefined,
      onProgress: (p) => p.done === 1 && ctl.abort(),
      signal: ctl.signal,
      sleep,
    });
    expect(Object.keys(state.sent)).toEqual(["1"]);
    const rest = buildPlan(cards, state, opts);
    expect(rest.map((p) => p.cardId)).toEqual([2, 3]);
  });
});

describe("language", () => {
  it("writes notes and status hashtags in the interface language", () => {
    setLang("en");
    const n = noteFor(card(1, "2026-01-01", { ai: ai("Design"), user: { note: "important", action: "idea" } }));
    expect(n.note).toContain("Note: important");
    expect(n.note).toContain("#idea");
  });

  it("keeps using the catch-all topic the group already has", () => {
    setLang("en");
    const state: BoardState = { ...emptyBoardState(), topics: { Разное: 7 } };
    expect(otherTopic(state)).toBe("Разное");
    expect(otherTopic(emptyBoardState())).toBe("Other");
  });
});
