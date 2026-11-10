import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { itemsFormat } from "./ai";
import { systemPrompt } from "./prompts";
import { allowedRequest } from "../../api/_lib/quota";

const item = (id: number, priority: number) => ({ id, title: "t", summary: "s", topic: "x", tags: ["a"], action: "idea", priority });

describe("AI answer parsing", () => {
  it("keeps the good items of a batch when one is out of range, and sends the exact schema", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const answer = JSON.stringify({ items: [item(1, 2), item(2, 4), { ...item(3, 1), action: "nonsense" }] });
    const client = new Anthropic({
      apiKey: "x",
      baseURL: "https://k.test/api/claude",
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      fetch: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        const msg = { id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: answer }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
        return new Response(JSON.stringify(msg), { headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch,
    });
    const res = await client.messages.parse({ model: "claude-haiku-5-5", max_tokens: 16000, system: systemPrompt("ru"), output_config: { effort: "low", format: itemsFormat() }, messages: [{ role: "user", content: "a" }] });
    expect(res.parsed_output?.items.map((i) => [i.id, i.priority])).toEqual([[1, 2], [2, 3]]);
    expect(allowedRequest(bodies[0])).toBeNull();
  });
});
