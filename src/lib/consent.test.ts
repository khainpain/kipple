import { describe, expect, it, vi } from "vitest";

// The MVP freeze switches AI off for the app; these tests are about consent, so AI is on here.
const features = vi.hoisted(() => ({ ai: true }));
vi.mock("./features", () => ({ FEATURES: features }));

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

  it("never allows AI while it is frozen, even after agreeing", () => {
    features.ai = false;
    expect(aiAllowed({ ...DEFAULT_SETTINGS, aiEnabled: true, aiConsentAt: "2026-11-06T20:00:00Z" })).toBe(false);
    features.ai = true;
  });
});
