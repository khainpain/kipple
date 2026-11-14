import { describe, expect, it } from "vitest";
import type { Card } from "./types";
import { healthOf, linkCounts } from "./linkcheck";

const link = (id: number, health?: "ok" | "broken" | "unknown", over: Partial<Card> = {}): Card => ({
  id,
  date: "2026-06-01T10:00:00Z",
  kind: "link",
  text: "",
  urls: [`https://a${id}.example/`],
  hashtags: [],
  link: health ? { url: `https://a${id}.example/`, fetchedAt: "t", health, checkedAt: "t" } : undefined,
  ...over,
});

describe("healthOf", () => {
  it("a page that answers is fine", () => {
    expect(healthOf({ status: 200 })).toBe("ok");
  });
  it("a page that is gone is broken", () => {
    expect(healthOf({ status: 404 })).toBe("broken");
    expect(healthOf({ status: 410 })).toBe("broken");
  });
  it("a site whose name no longer resolves is broken", () => {
    expect(healthOf({ error: "error sending request: dns error: failed to lookup address information" })).toBe("broken");
    expect(healthOf({ error: "net::ERR_NAME_NOT_RESOLVED" })).toBe("broken");
  });
  it("blocks, rate limits, server errors and timeouts can't tell", () => {
    for (const status of [401, 403, 429, 500, 503]) expect(healthOf({ status })).toBe("unknown");
    expect(healthOf({ error: "operation timed out" })).toBe("unknown");
    expect(healthOf({ error: "Failed to fetch" })).toBe("unknown");
  });
});

describe("linkCounts", () => {
  it("counts checked links of live cards only", () => {
    const cards = [link(1, "ok"), link(2, "broken"), link(3, "broken"), link(4, "unknown"), link(5), link(6, "broken", { removed: true })];
    expect(linkCounts(cards)).toEqual({ links: 5, checked: 4, ok: 1, broken: [2, 3], unknown: 1 });
  });
  it("leaves out cards already in the junk", () => {
    expect(linkCounts([link(1, "broken", { user: { action: "junk" } }), link(2, "broken")]).broken).toEqual([2]);
  });
});
