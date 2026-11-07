import { describe, expect, it } from "vitest";
import { imageSystemPrompt, synonymsSystemPrompt, systemPrompt } from "../../src/lib/prompts.js";
import { costMicro, installHash, itemCount, requestKind, summarizeMonth, usageCommands } from "./aiUsage.js";

const install = "abcdefgh-1234-5678-ijkl";

describe("requestKind", () => {
  it("knows the app's requests by their system prompt", () => {
    expect(requestKind(systemPrompt("ru"))).toBe("tag");
    expect(requestKind(imageSystemPrompt("source", "en"))).toBe("image");
    expect(requestKind(synonymsSystemPrompt("tags"))).toBe("synonyms");
    expect(requestKind("something else")).toBe("other");
    expect(requestKind(undefined)).toBe("other");
  });
});

describe("itemCount", () => {
  it("counts JSON lines for tagging and pictures for naming", () => {
    const text = 'Topic vocabulary: a\nTag vocabulary: b\n\nItems, one JSON line each:\n{"id":1}\n{"id":2}\n{"id":3}';
    expect(itemCount("tag", { messages: [{ role: "user", content: text }] })).toBe(3);
    const content = [{ type: "text", text: "v" }, { type: "text", text: "{}" }, { type: "image" }, { type: "text", text: "{}" }, { type: "image" }];
    expect(itemCount("image", { messages: [{ role: "user", content }] })).toBe(2);
    expect(itemCount("synonyms", { messages: [{ role: "user", content: "x" }] })).toBe(0);
  });
});

describe("costMicro", () => {
  it("uses list prices", () => {
    // 1M in + 1M out on Haiku 5.5 = $0.10 + $0.50
    expect(costMicro("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(600_000);
    expect(costMicro("claude-sonnet-5-5", { input_tokens: 300, output_tokens: 150 })).toBe(2100);
    expect(costMicro("claude-haiku-5-5", { cache_read_input_tokens: 1_000_000 })).toBe(10_000);
  });
});

describe("usageCommands", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const usage = { input_tokens: 12_000, output_tokens: 6_000 };
  it("adds tokens and cost to the day and the install's month, without the raw install id", () => {
    const cmds = usageCommands({ model: "claude-haiku-5-5", kind: "tag", items: 40, usage, ok: true, install, now });
    expect(cmds).toContainEqual(["HINCRBY", "ku:d:2026-11-09", "haiku|tag|req", 1]);
    expect(cmds).toContainEqual(["HINCRBY", "ku:d:2026-11-09", "haiku|tag|items", 40]);
    expect(cmds).toContainEqual(["HINCRBY", "ku:d:2026-11-09", "haiku|tag|in", 12_000]);
    expect(cmds).toContainEqual(["HINCRBY", "ku:d:2026-11-09", "haiku|tag|usd_micro", 4200]);
    expect(cmds).toContainEqual(["HINCRBY", "ku:m:2026-11", installHash(install), 4200]);
    expect(JSON.stringify(cmds)).not.toContain(install);
  });
  it("only counts an error when there is no answer", () => {
    expect(usageCommands({ model: "claude-opus-5-5", kind: "image", items: 6, ok: false, install, now })).toEqual([
      ["HINCRBY", "ku:d:2026-11-09", "opus|image|err", 1],
      ["EXPIRE", "ku:d:2026-11-09", 400 * 86_400],
    ]);
  });
});

describe("summarizeMonth", () => {
  it("turns per-install totals into users and cost per user", () => {
    const s = summarizeMonth({ a: 100_000, "a|items": 1000, b: 300_000, "b|items": 3000, c: 2_000_000, "c|items": 6000 });
    expect(s).toMatchObject({ installs: 3, items: 10_000, usd_total: 2.4, usd_per_install_avg: 0.8, usd_per_install_median: 0.3, usd_per_install_max: 2, usd_per_1000_items: 0.24 });
    expect(summarizeMonth({}).installs).toBe(0);
  });
});
