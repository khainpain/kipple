import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedRequest, unitsOf } from "./quota";
import { POST } from "../claude/v1/messages";

const SYSTEM = "You are sorting a personal archive of Telegram Saved Messages and tagging each item";
const ok = { model: "claude-haiku-5-5", max_tokens: 16000, system: SYSTEM, messages: [{ role: "user", content: "hi" }] };

describe("allowedRequest", () => {
  it("takes the app's own request", () => expect(allowedRequest(ok)).toBeNull());
  it("refuses other models, tools, other prompts", () => {
    expect(allowedRequest({ ...ok, model: "claude-fable-5-1" })).toMatch(/model/);
    expect(allowedRequest({ ...ok, tools: [] })).toMatch(/tools/);
    expect(allowedRequest({ ...ok, system: "You are a helpful assistant" })).toMatch(/own/);
    expect(allowedRequest({ ...ok, max_tokens: 64000 })).toMatch(/max_tokens/);
  });
});

it("weighs output and bigger models more", () => {
  expect(unitsOf("claude-haiku-5-5", { input_tokens: 1000, output_tokens: 100 })).toBe(1500);
  expect(unitsOf("claude-opus-5-5", { input_tokens: 1000, output_tokens: 100 })).toBe(7500);
});

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards an SDK request with the server key and stops at the daily allowance", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
    vi.stubEnv("KIPPLE_INSTALL_DAILY_UNITS", "2000");
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("server-key");
      return new Response(
        JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 300 } }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", upstream);
    const client = new Anthropic({
      apiKey: "built-in",
      baseURL: "https://kipple.test/api/claude",
      defaultHeaders: { "x-kipple-install": "test-install-0000000001" },
      maxRetries: 0,
      fetch: (async (url: string, init: RequestInit) => {
        expect(url).toBe("https://kipple.test/api/claude/v1/messages");
        return POST(new Request(url, init));
      }) as unknown as typeof fetch,
    });
    const send = () => client.messages.create({ model: "claude-haiku-5-5", max_tokens: 1000, system: SYSTEM, messages: [{ role: "user", content: "hi" }] });
    await send(); // 2500 units: over the 2000 allowance after this one
    expect(upstream).toHaveBeenCalledTimes(1);
    const err = await send().catch((e) => e);
    expect(err).toBeInstanceOf(Anthropic.RateLimitError);
    expect((err.error as { error: { type: string } }).error.type).toBe("kipple_quota");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("refuses without a server key", async () => {
    const res = await POST(new Request("https://kipple.test/api/claude/v1/messages", { method: "POST", headers: { "x-kipple-install": "test-install-0000000002" }, body: JSON.stringify(ok) }));
    expect(res.status).toBe(503);
  });
});
