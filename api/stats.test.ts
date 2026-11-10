import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (orig) => {
  const real = await orig<typeof import("node:crypto")>();
  return {
    ...real,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      spy.calls++;
      return real.timingSafeEqual(a, b);
    },
  };
});

const { GET } = await import("./stats.js");

const ask = (auth?: string) => GET(new Request("https://kipple.test/api/stats", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/stats", () => {
  beforeEach(() => {
    process.env.KIPPLE_STATS_TOKEN = "s3cret-token-for-tests";
    spy.calls = 0;
  });
  afterEach(() => {
    delete process.env.KIPPLE_STATS_TOKEN;
  });

  it("hides itself without the right token", async () => {
    for (const a of [undefined, "Bearer nope", "Bearer s3cret-token-for-test", "Bearer s3cret-token-for-testsX", "s3cret-token-for-tests"]) {
      expect((await ask(a)).status, String(a)).toBe(404);
    }
  });

  it("lets the right token through (then fails here: no counter store in tests)", async () => {
    expect((await ask("Bearer s3cret-token-for-tests")).status).toBe(503);
  });

  it("compares the token in constant time", async () => {
    await ask("Bearer s3cret-token-for-tests");
    await ask("Bearer short");
    expect(spy.calls).toBe(2);
  });

  it("is switched off without the variable", async () => {
    delete process.env.KIPPLE_STATS_TOKEN;
    expect((await ask("Bearer ")).status).toBe(404);
  });
});
