import { describe, expect, it } from "vitest";
import { FEATURES } from "./features";
import { SMART_LISTS } from "../components/nav";

describe("MVP freeze", () => {
  it("has every frozen feature switched off", () => {
    expect(Object.values(FEATURES).every((on) => on === false)).toBe(true);
  });

  it("leaves only All and Important among the sidebar's smart lists", () => {
    expect(SMART_LISTS.map((l) => l.key)).toEqual(["all", "important"]);
  });
});
