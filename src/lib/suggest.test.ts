import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "./types";
import { NO_ALIASES, setAliases } from "./library";
import { learnTopics, suggestTopic } from "./suggest";

const card = (id: number, text: string, over: Partial<Card> = {}): Card => ({ id, date: "2026-06-01T10:00:00Z", kind: "text", text, urls: [], hashtags: [], ...over });
const sorted = (id: number, text: string, topic: string, over: Partial<Card> = {}) => card(id, text, { ...over, user: { topic } });

/** Two topics sorted by hand, plus unsorted noise so common words don't count. */
const library = (): Card[] => [
  sorted(1, "Шакшука с фетой, рецепт на завтрак", "Еда"),
  sorted(2, "Паста с томатами за десять минут", "Еда"),
  sorted(3, "Суп из тыквы, простой рецепт", "Еда"),
  sorted(4, "Отчёт по встрече с клиентом", "Работа"),
  sorted(5, "Встреча команды в понедельник, план", "Работа"),
  card(6, "Смешное видео про котов"),
  card(7, "Погода на выходные"),
  card(8, "Купить лампочку"),
];

describe("suggestTopic", () => {
  afterEach(() => setAliases(NO_ALIASES));

  it("suggests the topic whose hand-sorted cards share words with the card", () => {
    const m = learnTopics(library());
    expect(suggestTopic(m, card(10, "Рецепт пирога с тыквой"))).toBe("Еда");
    expect(suggestTopic(m, card(11, "План встречи с клиентом"))).toBe("Работа");
  });

  it("matches word forms", () => {
    const m = learnTopics(library());
    expect(suggestTopic(m, card(12, "Ещё рецепты супов"))).toBe("Еда");
  });

  it("learns channels and sites, not only words", () => {
    const cards = [
      ...library(),
      sorted(20, "Пост один", "Еда", { forwardedFrom: "Вкусно и точка" }),
      sorted(21, "Пост два", "Еда", { forwardedFrom: "Вкусно и точка" }),
      sorted(22, "Статья", "Работа", { urls: ["https://hbr.org/a"] }),
      sorted(23, "Ещё статья", "Работа", { urls: ["https://hbr.org/b"] }),
    ];
    const m = learnTopics(cards);
    expect(suggestTopic(m, card(24, "Без общих слов", { forwardedFrom: "Вкусно и точка" }))).toBe("Еда");
    expect(suggestTopic(m, card(25, "", { kind: "link", urls: ["https://www.hbr.org/c"] }))).toBe("Работа");
  });

  it("suggests nothing for a card unlike any sorted one", () => {
    const m = learnTopics(library());
    expect(suggestTopic(m, card(13, "Билеты в кино на субботу"))).toBeUndefined();
    expect(suggestTopic(m, card(14, ""))).toBeUndefined();
  });

  it("suggests nothing when a long card shares just one word", () => {
    const m = learnTopics(library());
    expect(suggestTopic(m, card(15, "Длинный пост о поездке по горам Грузии: встреча с местными жителями, вино, хачапури и закаты над долиной"))).toBeUndefined();
  });

  it("needs at least two cards sorted by hand into a topic", () => {
    const m = learnTopics([sorted(1, "Рецепт шакшуки", "Еда"), card(2, "Погода"), card(3, "Лампочка")]);
    expect(suggestTopic(m, card(4, "Рецепт шакшуки с фетой"))).toBeUndefined();
  });

  it("learns only from topics picked by hand", () => {
    const ai = (id: number, text: string) => card(id, text, { ai: { title: "", summary: "", topic: "Еда", tags: [], action: "idea", priority: 2, model: "m", at: "t" } });
    const cards = [ai(1, "Рецепт шакшуки"), ai(2, "Рецепт пасты"), sorted(3, "Рецепт супа", ""), sorted(4, "Рецепт пирога", "Еда", { removed: true }), card(5, "Погода")];
    expect(suggestTopic(learnTopics(cards), card(6, "Рецепт борща"))).toBeUndefined();
  });

  it("uses topic names after merges", () => {
    setAliases({ topics: { Food: "Еда" }, tags: {} });
    const cards = [sorted(1, "Рецепт шакшуки", "Food"), sorted(2, "Рецепт пасты", "Еда"), card(3, "Погода"), card(4, "Лампочка")];
    expect(suggestTopic(learnTopics(cards), card(5, "Рецепт борща"))).toBe("Еда");
  });
});
