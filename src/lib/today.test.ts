import { describe, expect, it } from "vitest";
import type { Card } from "./types";
import { addDays, candidates, copiesDiffer, localDate, makePlan, planFor, resolvePlan, withSkip } from "./today";

const card = (id: number, over: Partial<Card> = {}): Card => ({ id, date: "2026-01-01", kind: "link", text: "", urls: [], hashtags: [], ...over });
const ai = (topic: string) => ({ title: "", summary: "", topic, tags: ["x"], action: "reference" as const, priority: 2 as const, model: "m", at: "t" });
const site = (host: string, n: number, from: number, over: Partial<Card> = {}) =>
  Array.from({ length: n }, (_, i) => card(from + i, { urls: [`https://${host}/p${from + i}`], ...over }));
const TODAY = "2026-11-07";

describe("dates", () => {
  it("formats the local date and adds days across a month", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
});

describe("candidates", () => {
  it("offers sites with enough cards without a topic, biggest first, with topics from the same site", () => {
    const cards = [...site("habr.com", 4, 1), ...site("habr.com", 2, 10, { ai: ai("Dev") }), ...site("youtube.com", 3, 20), ...site("tiny.io", 2, 30)];
    const tasks = candidates(cards, {}, TODAY);
    expect(tasks.map((t) => t.key)).toEqual(["s:habr.com", "s:youtube.com"]);
    const habr = tasks[0];
    expect(habr.kind === "site" && habr.cards.length).toBe(4);
    expect(habr.kind === "site" && habr.suggest[0]).toBe("Dev");
  });

  it("never uses sensitive, junk, hidden or removed cards", () => {
    const cards = [
      ...site("a.com", 3, 1, { sensitive: true }),
      ...site("b.com", 3, 10, { user: { action: "junk" } }),
      ...site("c.com", 3, 20, { user: { hidden: true } }),
      ...site("d.com", 3, 30, { removed: true }),
    ];
    expect(candidates(cards, {}, TODAY)).toEqual([]);
  });

  it("puts duplicates first and leaves out groups set aside", () => {
    const cards = [card(1, { urls: ["https://x.com/a"] }), card(2, { urls: ["https://x.com/a?utm_source=t"] }), card(3, { urls: ["https://y.com/b"] }), card(4, { urls: ["https://y.com/b"] })];
    const t = candidates(cards, {}, TODAY);
    expect(t[0].kind).toBe("dupes");
    expect(t[0].kind === "dupes" && t[0].groups.length).toBe(2);
    const skips = withSkip({}, "d:u:x.com/a", TODAY, true);
    const after = candidates(cards, skips, TODAY);
    expect(after[0].kind === "dupes" && after[0].groups.map((g) => g.key)).toEqual(["u:y.com/b"]);
  });
});

describe("plan", () => {
  const cards = [...site("a.com", 5, 1), ...site("b.com", 4, 10), ...site("c.com", 3, 20), ...site("d.com", 3, 30)];

  it("takes three tasks and keeps the saved plan for the same day", () => {
    const plan = makePlan(cards, {}, TODAY);
    expect(plan.keys).toEqual(["s:a.com", "s:b.com", "s:c.com"]);
    expect(planFor(plan, [], {}, TODAY)).toBe(plan);
    expect(planFor(plan, cards, {}, "2026-11-08").date).toBe("2026-11-08");
  });

  it("counts a task as done once its cards are sorted another way", () => {
    const plan = makePlan(cards, {}, TODAY);
    for (const c of cards.slice(0, 5)) c.user = { topic: "Misc" };
    const tasks = resolvePlan(plan, cards, {}, TODAY);
    expect(tasks[0]).toBeNull();
    expect(tasks[1]?.key).toBe("s:b.com");
  });

  it("can build the next three without the ones already done", () => {
    expect(makePlan(cards, {}, TODAY, ["s:b.com"]).keys).not.toContain("s:b.com");
  });
});

describe("withSkip", () => {
  it("sets aside for a week or for good, and forgets old dates", () => {
    const s = withSkip({ old: "2026-01-01", keep: "never" }, "s:a.com", TODAY);
    expect(s).toEqual({ keep: "never", "s:a.com": "2026-11-14" });
    expect(candidates(site("a.com", 3, 1), s, TODAY)).toEqual([]);
    expect(candidates(site("a.com", 3, 1), s, "2026-11-14")).toHaveLength(1);
  });
});

describe("copiesDiffer", () => {
  it("ignores spacing but not a different note", () => {
    expect(copiesDiffer([card(1, { text: "a  b" }), card(2, { text: "a b " })])).toBe(false);
    expect(copiesDiffer([card(1), card(2, { user: { note: "keep this" } })])).toBe(true);
  });
});
