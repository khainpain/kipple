import { describe, expect, it } from "vitest";
import { cleanCode, codeCells } from "./loginCode";

describe("login code cells", () => {
  it("lays a pasted code out over the cells", () => {
    expect(cleanCode("48 213")).toBe("48213");
    expect(cleanCode("Code: 48-213.")).toBe("48213");
    expect(codeCells(cleanCode("48213"))).toEqual({ digits: ["4", "8", "2", "1", "3"], active: 4 });
  });

  it("moves the active cell back on Backspace", () => {
    const typed = cleanCode("482");
    expect(codeCells(typed).active).toBe(3);
    expect(codeCells(typed.slice(0, -1))).toEqual({ digits: ["4", "8", "", "", ""], active: 2 });
    expect(codeCells("")).toEqual({ digits: ["", "", "", "", ""], active: 0 });
  });

  it("adds a sixth cell for a longer code and stops there", () => {
    expect(codeCells("482137").digits).toHaveLength(6);
    expect(cleanCode("4821379")).toBe("482137");
  });
});
