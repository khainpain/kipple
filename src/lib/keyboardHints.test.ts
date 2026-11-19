import { describe, expect, it } from "vitest";
import { layoutFromKey, layoutFromMap } from "./keyboardHints";

describe("layoutFromKey", () => {
  it("names the layout from a typed letter", () => {
    expect(layoutFromKey("q")).toBe("EN");
    expect(layoutFromKey("Q")).toBe("EN");
    expect(layoutFromKey("й")).toBe("RU");
    expect(layoutFromKey("Ё")).toBe("RU");
    expect(layoutFromKey("ї")).toBe("RU"); // Ukrainian: still a Cyrillic layout
  });
  it("keeps the last answer for keys that don't tell (digits, symbols, Shift)", () => {
    expect(layoutFromKey("1")).toBeNull();
    expect(layoutFromKey("!")).toBeNull();
    expect(layoutFromKey("Shift")).toBeNull();
    expect(layoutFromKey("Backspace")).toBeNull();
  });
  it("names other scripts by nothing rather than a wrong guess", () => {
    expect(layoutFromKey("ü")).toBe("EN"); // Latin with marks: still a Latin layout
    expect(layoutFromKey("α")).toBeNull();
  });
});

describe("layoutFromMap", () => {
  it("reads the layout from what the Q key types", () => {
    expect(layoutFromMap(new Map([["KeyQ", "q"]]))).toBe("EN");
    expect(layoutFromMap(new Map([["KeyQ", "й"]]))).toBe("RU");
    expect(layoutFromMap(new Map())).toBeNull();
  });
});
