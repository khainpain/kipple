import { afterEach, describe, expect, it } from "vitest";
import { effectiveTopic, NO_ALIASES, NO_RULES, setAliases, setTopicRules } from "./library";
import { builtinTopicOf } from "./siteTopics";
import { ruleOffer, withoutRulesTo } from "./topicRules";
import { T } from "../i18n";
import type { Card } from "./types";

const card = (id: number, p: Partial<Card> = {}): Card => ({ id, date: "2026-01-01", kind: "text", text: "x", urls: [], hashtags: [], ...p });
const ai = (topic: string): Card["ai"] => ({ title: "", summary: "", topic, tags: [], action: "reference", priority: 2, model: "m", at: "t" });

afterEach(() => {
  setTopicRules(NO_RULES);
  setAliases(NO_ALIASES);
});

describe("built-in site topics", () => {
  it("know topical sites, subdomains included", () => {
    expect(builtinTopicOf("https://github.com/a/b")).toBe(T.siteTopics.dev);
    expect(builtinTopicOf("https://ru.m.imdb.com/title/1")).toBe(T.siteTopics.movies);
    expect(builtinTopicOf("https://www.kinopoisk.ru/film/1")).toBe(T.siteTopics.movies);
  });

  it("leave platforms and unknown sites alone", () => {
    expect(builtinTopicOf("https://youtube.com/watch?v=1")).toBeUndefined();
    expect(builtinTopicOf("https://example.org")).toBeUndefined();
    expect(builtinTopicOf("not a url")).toBeUndefined();
    expect(builtinTopicOf(undefined)).toBeUndefined();
  });
});

describe("effective topic without AI", () => {
  it("comes from the built-in site list when nothing else sets one", () => {
    expect(effectiveTopic(card(1, { kind: "link", urls: ["https://github.com/x"] }))).toBe(T.siteTopics.dev);
  });

  it("follows a channel rule, then a site rule (subdomains too)", () => {
    setTopicRules({ channels: { "Кулинарный канал": "Рецепты" }, sites: { "habr.com": "Код" } });
    expect(effectiveTopic(card(1, { forwardedFrom: "Кулинарный канал", urls: ["https://habr.com/a"] }))).toBe("Рецепты");
    expect(effectiveTopic(card(2, { urls: ["https://m.habr.com/a"] }))).toBe("Код");
    expect(effectiveTopic(card(3, { forwardedFrom: "Другой" }))).toBeUndefined();
  });

  it("puts a hand-picked topic first, then rules, then the AI, then the built-in list", () => {
    setTopicRules({ channels: { Dev: "Код" }, sites: {} });
    const gh = { urls: ["https://github.com/x"] };
    expect(effectiveTopic(card(1, { ...gh, forwardedFrom: "Dev", ai: ai("Работа"), user: { topic: "Своё" } }))).toBe("Своё");
    expect(effectiveTopic(card(2, { ...gh, forwardedFrom: "Dev", ai: ai("Работа") }))).toBe("Код");
    expect(effectiveTopic(card(3, { ...gh, ai: ai("Работа") }))).toBe("Работа");
    // A topic cleared by hand stays cleared.
    expect(effectiveTopic(card(4, { ...gh, forwardedFrom: "Dev", user: { topic: "" } }))).toBe("");
  });

  it("shows rule topics under their renamed name", () => {
    setTopicRules({ channels: { Dev: "Код" }, sites: {} });
    setAliases({ topics: { Код: "Разработка" }, tags: {} });
    expect(effectiveTopic(card(1, { forwardedFrom: "Dev" }))).toBe("Разработка");
  });
});

describe("rule offer after a topic is set by hand", () => {
  const lib = [
    card(1, { forwardedFrom: "Еда", user: { topic: "Рецепты" } }),
    card(2, { forwardedFrom: "Еда" }),
    card(3, { forwardedFrom: "Еда", user: { topic: "Другое" } }),
    card(4, { forwardedFrom: "Еда" }),
    card(5, { urls: ["https://habr.com/1"], user: { topic: "Код" } }),
    card(6, { urls: ["https://habr.com/2"] }),
    card(7, { urls: ["https://youtube.com/watch?v=1"], user: { topic: "Видео" } }),
    card(8, { urls: ["https://youtube.com/watch?v=2"] }),
  ];

  it("offers the channel, counting the other cards without a hand-picked topic", () => {
    expect(ruleOffer(lib, [1], "Рецепты")).toEqual({ kind: "channel", key: "Еда", count: 2 });
  });

  it("offers the site when there's no channel", () => {
    expect(ruleOffer(lib, [5], "Код")).toEqual({ kind: "site", key: "habr.com", count: 1 });
  });

  it("never offers platforms like YouTube, a cleared topic, or a rule that is already there", () => {
    expect(ruleOffer(lib, [7], "Видео")).toBeUndefined();
    expect(ruleOffer(lib, [1], "")).toBeUndefined();
    setTopicRules({ channels: { Еда: "Рецепты" }, sites: {} });
    expect(ruleOffer(lib, [1], "Рецепты")).toBeUndefined();
  });

  it("needs every moved card from the same channel and someone else to move", () => {
    expect(ruleOffer(lib, [1, 5], "Рецепты")).toBeUndefined();
    expect(ruleOffer([card(1, { forwardedFrom: "Один", user: { topic: "A" } })], [1], "A")).toBeUndefined();
  });
});

describe("deleting a topic", () => {
  it("drops the rules that point at it", () => {
    const r = withoutRulesTo({ channels: { A: "Код", B: "Еда" }, sites: { "habr.com": "Код" } }, "Код");
    expect(r).toEqual({ channels: { B: "Еда" }, sites: {} });
  });
});
