import { afterEach, describe, expect, it } from "vitest";
import { findTopic, getOwnTopics, NO_ALIASES, setAliases, setOwnTopics } from "./library";
import { vocabulary } from "./ai";
import type { Card } from "./types";

const card = (id: number, topic: string, user?: Card["user"], lang = "ru"): Card => ({
  id,
  date: "2026-01-01",
  kind: "text",
  text: "x",
  urls: [],
  hashtags: [],
  ai: { title: "", summary: "", topic, tags: [], action: "reference", priority: 2, model: "m", at: "t", lang },
  user,
});

describe("own topics", () => {
  afterEach(() => {
    setAliases(NO_ALIASES);
    setOwnTopics([]);
  });

  it("are shown under their renamed name, once", () => {
    setOwnTopics(["Рецепты", "Готовка", ""]);
    setAliases({ topics: { Готовка: "Рецепты" }, tags: {} });
    expect(getOwnTopics()).toEqual(["Рецепты"]);
  });

  it("findTopic ignores case", () => {
    expect(findTopic(["Дизайн", "Код"], " дизайн ")).toBe("Дизайн");
    expect(findTopic(["Дизайн"], "Еда")).toBeUndefined();
  });

  it("go to the AI first, even when empty, and aren't repeated in the vocabulary", () => {
    setOwnTopics(["Рецепты"]);
    const v = vocabulary([card(1, "Дизайн"), card(2, "Рецепты")], "ru");
    expect(v.own).toEqual(["Рецепты"]);
    expect(v.topics).toEqual(["Дизайн"]);
  });

  it("vocabulary follows renames and deletions, not the AI's old names", () => {
    setAliases({ topics: { Дизайн: "UI" }, tags: {} });
    const v = vocabulary([card(1, "Дизайн"), card(2, "Еда", { topic: "" }), card(3, "Code", { topic: "Код" }, "en")], "ru");
    expect(v.topics.sort()).toEqual(["UI", "Код"]);
  });
});
