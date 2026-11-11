import { describe, expect, it } from "vitest";
import { stem } from "./stem";

const same = (words: string[]) => new Set(words.map(stem)).size;

describe("stem", () => {
  it("gives Russian noun forms one stem", () => {
    expect(same(["кошка", "кошки", "кошкой", "кошкам", "кошку"])).toBe(1);
    expect(same(["рецепт", "рецепты", "рецептов", "рецептами"])).toBe(1);
  });
  it("gives Russian verb and adjective forms one stem", () => {
    expect(same(["читать", "читаю", "читал", "читала"])).toBe(1);
    expect(same(["новый", "новая", "новые", "новых"])).toBe(1);
  });
  it("gives English forms one stem", () => {
    expect(same(["cat", "cats"])).toBe(1);
    expect(same(["run", "running", "runs"])).toBe(1);
    expect(same(["study", "studies"])).toBe(1);
  });
  it("leaves short words whole, so a two-letter query stays narrow", () => {
    expect(stem("ии")).toBe("ии");
    expect(stem("ее")).toBe("ее");
    expect(stem("ai")).toBe("ai");
  });
  it("leaves numbers and mixed words alone", () => {
    expect(stem("2026")).toBe("2026");
    expect(stem("iphone15")).toBe("iphone15");
    expect(stem("tg-бот")).toBe("tg-бот");
  });
  it("treats ё as е and ignores case", () => {
    expect(stem("Ёлки")).toBe(stem("елка"));
  });
});
