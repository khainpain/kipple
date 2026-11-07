import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const sent: { url: string; body: unknown }[] = [];
let online = true;

vi.mock("@platform", () => ({
  platform: {
    kind: "desktop",
    data: {
      exists: async (n: string) => files.has(n),
      read: async (n: string) => files.get(n)!,
      write: async (n: string, d: string) => void files.set(n, d),
      append: async () => undefined,
    },
    appVersion: async () => "0.1.16",
    httpFetch: async (url: string, init: RequestInit) => {
      if (!online) throw new Error("offline");
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    },
  },
}));
vi.mock("./ai", () => ({ PROXY_BASE: "https://example.com/api/claude" }));

const t = await import("./telemetry");
const ctx = () => ({ libraryCount: 1234, ai: "off" as const, lang: "ru" });

beforeEach(() => {
  files.clear();
  sent.length = 0;
  online = true;
  t._resetTelemetry();
});

describe("telemetry", () => {
  it("sends one ping a day with counts only, then starts counting again", async () => {
    await t.initTelemetry({ enabled: true, hadLibrary: false, context: ctx });
    t.track("search_used");
    t.track("search_used");
    t.track("export_completed", "md");
    await t.maybeSendPing();
    await t.maybeSendPing();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://example.com/api/ping");
    expect(sent[0].body).toMatchObject({
      v: "0.1.16",
      lang: "ru",
      age: "0",
      library: "1k-5k",
      ai: "off",
      week: true,
      events: { app_first_launch: 1, search_used: 2, "export_completed:md": 1 },
    });
    expect(Object.keys(sent[0].body as object).sort()).toEqual(["age", "ai", "cohort", "events", "lang", "library", "os", "v", "week"]);
    expect(t.pingPreview()?.events).toEqual({});
  });

  it("keeps the counts when offline", async () => {
    await t.initTelemetry({ enabled: true, hadLibrary: false, context: ctx });
    t.track("card_opened");
    online = false;
    await t.maybeSendPing();
    expect(t.pingPreview()?.events).toMatchObject({ card_opened: 1 });
  });

  it("sends nothing and drops the counts when turned off", async () => {
    await t.initTelemetry({ enabled: true, hadLibrary: false, context: ctx });
    t.track("card_opened");
    t.setTelemetryEnabled(false);
    t.track("card_opened");
    await t.maybeSendPing();
    expect(sent).toHaveLength(0);
    expect(t.pingPreview()?.events).toEqual({});
  });

  it("counts nothing in the demo", async () => {
    await t.initTelemetry({ enabled: true, hadLibrary: true, context: ctx });
    t.setTelemetrySuspended(true);
    t.track("card_opened");
    expect(t.pingPreview()?.events).toEqual({});
  });

  it("marks an update from a version without statistics as legacy, not a new install", async () => {
    expect(await t.initTelemetry({ enabled: true, hadLibrary: true, context: ctx })).toBe(true);
    expect(t.pingPreview()).toMatchObject({ cohort: "legacy", events: {} });
    t._resetTelemetry();
    expect(await t.initTelemetry({ enabled: true, hadLibrary: true, context: ctx })).toBe(false);
  });

  it("ignores values outside the fixed list", async () => {
    await t.initTelemetry({ enabled: true, hadLibrary: true, context: ctx });
    // @ts-expect-error not a known value
    t.track("export_completed", "pdf");
    expect(t.pingPreview()?.events).toEqual({});
  });
});
