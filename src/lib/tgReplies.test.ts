import { describe, expect, it } from "vitest";
import { dueReplies, findLeftovers, isKippleReply, leftoverReplies, nextDue, replyText, scheduleLeftovers, scheduleReply, validReplies, withoutReplies, type PendingReply } from "./tgReplies";
import { messageToCard } from "./parser";

const now = new Date("2026-11-07T20:00:00Z");

describe("helper replies", () => {
  it("schedules deletion by the setting", () => {
    expect(scheduleReply([], 5, 7, now, "1m")).toEqual([{ id: 5, owner: 7, at: "2026-11-07T20:01:00.000Z" }]);
    expect(scheduleReply([], 5, 7, now, "1h")).toEqual([{ id: 5, owner: 7, at: "2026-11-07T21:00:00.000Z" }]);
    expect(scheduleReply([], 5, 7, now, "never")).toEqual([]);
  });

  it("deletes only what is due", () => {
    const list = [
      { id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" },
      { id: 2, owner: 7, at: "2026-11-07T20:00:30.000Z" },
      { id: 1, owner: 8, at: "2026-11-07T19:58:00.000Z" },
    ];
    expect(dueReplies(list, now)).toEqual(new Map([[7, [1]], [8, [1]]]));
    expect(withoutReplies(list, 7, [1])).toEqual([list[1], list[2]]);
    expect(nextDue(list.slice(1, 2), now)).toBe(30_000);
    expect(nextDue([], now)).toBeNull();
  });

  it("drops damaged entries instead of looping on them", () => {
    expect(validReplies([{ id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" }, { id: 2, at: "x" }, { id: 3 }, null, "x"])).toEqual([
      { id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" },
    ]);
    expect(validReplies({})).toEqual([]);
  });

  it("never turns a helper reply into a card", () => {
    expect(isKippleReply(replyText())).toBe(true);
    expect(isKippleReply("hello")).toBe(false);
    expect(messageToCard({ id: 9, type: "message", date: "2026-11-07T20:00:00", text: replyText() })).toBeNull();
    expect(messageToCard({ id: 10, type: "message", date: "2026-11-07T20:00:00", text: "a note" })).not.toBeNull();
  });

  it("still knows the replies of older versions, with or without the emoji", () => {
    expect(isKippleReply("↑ Kipple · Tap the quote above to go to the message")).toBe(true);
    expect(replyText()).toMatch(/^↑ Kipple \p{Extended_Pictographic}/u);
  });

  it("finds leftover helper replies among loaded messages, only the user's own plain ones", () => {
    const m = (id: number, text: string, over: object = {}) => ({ id, date: 0, text, entities: [], ...over });
    expect(
      leftoverReplies([
        m(1, replyText()),
        m(2, "a note"),
        m(3, replyText(), { forwardedFrom: "Someone" }),
        m(4, replyText(), { media: { kind: "photo" } }),
        m(5, "↑ Kipple · нажми на цитату, чтобы перейти к сообщению"),
        m(6, "↑ Kipple · tap the quote to jump to the message"),
        m(7, "↑ Kipple ideas for the roadmap"),
      ]),
    ).toEqual([1, 5, 6]);
  });

  it("schedules leftovers by the setting, keeping replies that are already waiting", () => {
    const waiting = [{ id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" }];
    expect(scheduleLeftovers(waiting, [1, 2], 7, now, "1m")).toEqual([...waiting, { id: 2, owner: 7, at: "2026-11-07T20:01:00.000Z" }]);
    expect(scheduleLeftovers(waiting, [2], 7, now, "never")).toBe(waiting);
    expect(scheduleLeftovers(waiting, [], 7, now, "1m")).toBe(waiting);
  });

  const msg = (id: number, text: string, over: object = {}) => ({ id, date: 0, text, entities: [], ...over });

  it("finds replies left in Saved Messages on start and schedules them", async () => {
    let list: PendingReply[] = [{ id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" }];
    const update = async (change: (l: PendingReply[]) => PendingReply[]) => {
      list = change(list);
    };
    const tg = { findReplies: async () => ({ owner: 7, messages: [msg(1, replyText()), msg(2, replyText()), msg(3, "↑ Kipple ideas"), msg(4, replyText(), { forwardedFrom: "Someone" })] }) };
    expect(await findLeftovers({ tg, update, cleanup: "1m", now })).toBe(1);
    expect(list).toEqual([{ id: 1, owner: 7, at: "2026-11-07T19:59:00.000Z" }, { id: 2, owner: 7, at: "2026-11-07T20:01:00.000Z" }]);
  });

  it("doesn't look in Telegram when replies are kept or the account is unknown", async () => {
    let asked = 0;
    const tg = {
      findReplies: async () => {
        asked++;
        return { owner: null, messages: [msg(2, replyText())] };
      },
    };
    const update = async () => {
      throw new Error("must not change the list");
    };
    expect(await findLeftovers({ tg, update, cleanup: "never", now })).toBe(0);
    expect(asked).toBe(0);
    expect(await findLeftovers({ tg, update, cleanup: "1m", now })).toBe(0);
    expect(asked).toBe(1);
  });
});
