import { describe, expect, it } from "vitest";
import { downloadSource, parsePing, pingCommands } from "./stats.js";

const ok = { v: "0.1.16", os: "windows", lang: "ru", cohort: "2026-W45", age: "14-29", library: "1k-5k", ai: "off", week: true, events: { search_used: 3, "import_completed:direct": 1 } };

describe("parsePing", () => {
  it("accepts what the app sends", () => {
    expect(parsePing(ok)).toEqual(ok);
    expect(parsePing({ ...ok, cohort: "legacy", v: "", events: {} })).not.toBeNull();
  });
  it("refuses unknown fields, so nothing extra can be smuggled in", () => {
    expect(parsePing({ ...ok, id: "abc" })).toBeNull();
    expect(parsePing({ ...ok, events: { "search_used:cats": 1 } })).toBeNull();
    expect(parsePing({ ...ok, events: { "import_completed:dropbox": 1 } })).toBeNull();
    expect(parsePing({ ...ok, events: { message_text: 1 } })).toBeNull();
  });
  it("refuses values outside the fixed lists", () => {
    expect(parsePing({ ...ok, os: "Windows 11 Pro 23H2" })).toBeNull();
    expect(parsePing({ ...ok, cohort: "2026-11-07" })).toBeNull();
    expect(parsePing({ ...ok, v: "my secret" })).toBeNull();
    expect(parsePing({ ...ok, events: { search_used: 5000 } })).toBeNull();
    expect(parsePing({ ...ok, events: { search_used: 1.5 } })).toBeNull();
    expect(parsePing([ok])).toBeNull();
  });
});

describe("pingCommands", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("adds to the day's totals, and to the week's on the first ping of the week", () => {
    const cmds = pingCommands(parsePing(ok)!, now);
    expect(cmds).toContainEqual(["HINCRBY", "kt:d:2026-11-09", "active", 1]);
    expect(cmds).toContainEqual(["HINCRBY", "kt:d:2026-11-09", "cohort:2026-W45|14-29", 1]);
    expect(cmds).toContainEqual(["HINCRBY", "kt:d:2026-11-09", "e:search_used", 3]);
    expect(cmds).toContainEqual(["HINCRBY", "kt:w:2026-W46", "active", 1]);
    expect(cmds.filter((c) => c[0] === "EXPIRE")).toHaveLength(2);
  });
  it("leaves the week alone on later pings of the week", () => {
    const cmds = pingCommands({ ...parsePing(ok)!, week: false }, now);
    expect(cmds.some((c) => String(c[1]).startsWith("kt:w:"))).toBe(false);
  });
});

describe("downloadSource", () => {
  it("keeps short plain names and calls the rest direct", () => {
    expect(downloadSource("Telegram")).toBe("telegram");
    expect(downloadSource(null)).toBe("direct");
    expect(downloadSource("<script>")).toBe("direct");
    expect(downloadSource("x".repeat(40))).toBe("direct");
  });
});
