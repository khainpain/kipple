import { describe, expect, it } from "vitest";
import { aiAllowed, DEFAULT_SETTINGS, withoutUnconsentedAi } from "./store";

describe("AI consent", () => {
  it("is off for new installs", () => {
    expect(DEFAULT_SETTINGS.aiEnabled).toBe(false);
    expect(aiAllowed(DEFAULT_SETTINGS)).toBe(false);
  });

  it("turns AI off for older installs that never agreed", () => {
    const old = withoutUnconsentedAi({ ...DEFAULT_SETTINGS, aiEnabled: true, aiImages: true });
    expect(old.aiEnabled).toBe(false);
    expect(old.aiImages).toBe(false);
    expect(aiAllowed({ ...DEFAULT_SETTINGS, aiEnabled: true })).toBe(false);
  });

  it("keeps AI on once agreed", () => {
    const s = withoutUnconsentedAi({ ...DEFAULT_SETTINGS, aiEnabled: true, aiConsentAt: "2026-11-06T20:00:00Z" });
    expect(aiAllowed(s)).toBe(true);
  });
});
