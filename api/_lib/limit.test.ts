import { describe, expect, it } from "vitest";
import { limitKey, withinLimit } from "./limit.js";

describe("withinLimit", () => {
  it("lets the first `limit` hits of a window through, then refuses", async () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const hits = [];
    for (let i = 0; i < 5; i++) hits.push(await withinLimit("t1", "203.0.113.7", 3, 86_400, now));
    expect(hits).toEqual([true, true, true, false, false]);
  });

  it("counts each address and each window on its own", async () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(await withinLimit("t2", "203.0.113.8", 1, 60, now)).toBe(true);
    expect(await withinLimit("t2", "203.0.113.8", 1, 60, now)).toBe(false);
    expect(await withinLimit("t2", "203.0.113.9", 1, 60, now)).toBe(true);
    expect(await withinLimit("t2", "203.0.113.8", 1, 60, now + 60_000)).toBe(true);
  });

  it("counts an IPv6 /64 as one client", async () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(await withinLimit("t3", "2001:db8:1:2::1", 1, 60, now)).toBe(true);
    expect(await withinLimit("t3", "2001:db8:1:2:ffff::9", 1, 60, now)).toBe(false);
  });
});

describe("limitKey", () => {
  it("keeps no address in the key, only a short hash many addresses share", () => {
    const k = limitKey("ping", "203.0.113.7", 0);
    expect(k).not.toContain("203.0.113");
    expect(k).toMatch(/^kr:ping:0:[0-9a-f]{6}$/);
  });
  it("gives the same address another hash in another window, so days can't be linked", () => {
    expect(limitKey("ping", "203.0.113.7", 1)).not.toBe(limitKey("ping", "203.0.113.7", 2).replace(":2:", ":1:"));
  });
});
