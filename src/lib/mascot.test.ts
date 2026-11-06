import { describe, expect, it } from "vitest";
import { ANGRY_AT, ANGRY_MS, CLICK_GAP_MS, INITIAL_TAPS, SALTO_AT, tapMascot, type TapEffect, type TapState } from "./mascot";

function clicks(times: number[], start: TapState = INITIAL_TAPS) {
  let s = start;
  const effects: TapEffect[] = [];
  for (const t of times) {
    const r = tapMascot(s, t);
    s = r.state;
    effects.push(r.effect);
  }
  return { s, effects };
}

const quick = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + i * 200);

describe("mascot easter eggs", () => {
  it("does one salto on the 7th quick click", () => {
    const { effects } = clicks(quick(SALTO_AT));
    expect(effects.filter((e) => e === "salto")).toHaveLength(1);
    expect(effects[SALTO_AT - 1]).toBe("salto");
  });

  it("gets angry on the 13th, then starts over", () => {
    const { s, effects } = clicks(quick(ANGRY_AT));
    expect(effects[ANGRY_AT - 1]).toBe("angry");
    expect(effects.filter((e) => e === "salto")).toHaveLength(1);
    expect(s.count).toBe(0);
  });

  it("ignores clicks while angry", () => {
    const { s } = clicks(quick(ANGRY_AT));
    const during = tapMascot(s, s.last + ANGRY_MS - 100);
    expect(during.effect).toBe("none");
    expect(during.state).toBe(s);
    const after = tapMascot(s, s.last + ANGRY_MS + 1);
    expect(after.state.count).toBe(1);
  });

  it("a pause longer than 1.5 s resets the count", () => {
    const first = quick(6);
    const { effects } = clicks([...first, first[5] + CLICK_GAP_MS + 1]);
    expect(effects).not.toContain("salto");
  });
});
