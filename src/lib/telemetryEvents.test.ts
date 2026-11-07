import { describe, expect, it } from "vitest";
import { ageBucket, eventKey, isoWeek, libraryBucket } from "./telemetryEvents";

describe("telemetry vocabulary", () => {
  it("writes event keys only from the fixed list", () => {
    expect(eventKey("search_used")).toBe("search_used");
    expect(eventKey("search_used", "x")).toBeNull();
    expect(eventKey("export_completed", "md")).toBe("export_completed:md");
    expect(eventKey("export_completed")).toBeNull();
    expect(eventKey("nope")).toBeNull();
  });
  it("buckets ages and library sizes", () => {
    expect([0, 1, 3, 7, 14, 29, 30, 400].map(ageBucket)).toEqual(["0", "1", "2-6", "7-13", "14-29", "14-29", "30+", "30+"]);
    expect([0, 5, 100, 4999, 5000].map(libraryBucket)).toEqual(["0", "1-99", "100-999", "1k-5k", "5k+"]);
  });
  it("names ISO weeks", () => {
    expect(isoWeek(new Date("2026-11-07T12:00:00Z"))).toBe("2026-W45");
    expect(isoWeek(new Date("2026-11-09T00:00:00Z"))).toBe("2026-W46");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
  });
});
