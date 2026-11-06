import { describe, expect, it } from "vitest";
import { annotateContext } from "./library";
import type { Card } from "./types";

const card = (id: number, minute: number, kind: Card["kind"], text = "", extra: Partial<Card> = {}): Card => ({
  id,
  date: new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString(),
  kind,
  text,
  urls: [],
  hashtags: [],
  ...extra,
});

describe("annotateContext", () => {
  it("names an uncaptioned photo after the nearest text message", () => {
    const cards = [card(1, 0, "photo"), card(2, 1, "text", "Рецепт сырников\nвторая строка"), card(3, 30, "text", "далеко")];
    annotateContext(cards);
    expect(cards[0].context).toBe("Рецепт сырников");
  });

  it("borrows the caption of a photo sent in the same batch", () => {
    const cards = [card(1, 0, "photo", "Референсы для лендинга"), card(2, 0, "photo")];
    annotateContext(cards);
    expect(cards[1].context).toBe("Референсы для лендинга");
    expect(cards[0].context).toBeUndefined();
  });

  it("ignores far and sensitive neighbours", () => {
    const cards = [card(1, 0, "photo"), card(2, 1, "text", "пароль: 123", { sensitive: true }), card(3, 20, "text", "потом")];
    annotateContext(cards);
    expect(cards[0].context).toBeUndefined();
  });
});
