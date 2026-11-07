import { describe, expect, it } from "vitest";
import { dueReplies, isKippleReply, nextDue, replyText, scheduleReply, validReplies, withoutReplies } from "./tgReplies";
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
});
