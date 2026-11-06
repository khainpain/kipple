// What the built-in key may be used for, and how much. Folders starting with "_" under api/
// are not functions themselves; Vercel bundles this into the functions that import it.
//
// Usage is counted in "units": roughly a millionth of a dollar at Haiku prices
// (input token = 1, output token = 5, cache read = 0.1), times the model's weight.
// So 1,000,000 units ≈ $1, and the limits below read as dollars per day.
//
// Counters live in Upstash Redis (Vercel → Storage → Upstash, which sets KV_REST_API_URL and
// KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL/_TOKEN). Without it they are kept in the
// function's memory: fine for a handful of friends, but each instance counts on its own.

import { allSystemPrompts, outputFormat } from "../../src/lib/prompts";

declare const process: { env: Record<string, string | undefined> };
export const env = (name: string): string | undefined => process.env[name] || undefined;

const num = (name: string, fallback: number) => {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const LIMITS = {
  /** One install per UTC day. Tagging 10,000 messages with Haiku is about 1.5–2.5M. */
  install: () => num("KIPPLE_INSTALL_DAILY_UNITS", 3_000_000),
  /** One IP address per UTC day, so making up new install ids doesn't help much. */
  ip: () => num("KIPPLE_IP_DAILY_UNITS", 6_000_000),
  /** Everyone together per UTC day: the most the built-in key can cost in a day. */
  global: () => num("KIPPLE_GLOBAL_DAILY_UNITS", 20_000_000),
  /** Requests per IP per minute. The app sends at most 3 at a time. */
  ipPerMinute: () => num("KIPPLE_IP_REQUESTS_PER_MINUTE", 40),
};

/** The models of the Settings picker (src/lib/ai.ts AI_MODELS), with their price relative to Haiku. */
export const MODEL_WEIGHT: Record<string, number> = {
  "claude-haiku-5-5": 1,
  "claude-sonnet-5-5": 3,
  "claude-opus-5-5": 5,
};

const MAX_TOKENS = 16_000;

// The app's exact system prompts and answer schema (src/lib/prompts.ts). Anything else is not the app:
// checking only the start of the prompt would let anyone append their own instructions and use the
// key as a free general-purpose Claude.
let expected: { prompts: Set<string>; format: string } | null = null;
const app = () => (expected ??= { prompts: new Set(allSystemPrompts()), format: JSON.stringify(outputFormat()) });

/** Why the request isn't one the app would send, or null if it is. */
export function allowedRequest(body: Record<string, unknown>): string | null {
  if (typeof body.model !== "string" || !(body.model in MODEL_WEIGHT)) return "This model is not available with the built-in key.";
  if (typeof body.max_tokens !== "number" || body.max_tokens > MAX_TOKENS) return "max_tokens is too large.";
  if (body.stream) return "Streaming is not supported.";
  for (const k of ["tools", "tool_choice", "mcp_servers", "container"]) if (k in body) return `${k} is not supported.`;
  const own = "Only the app's own requests are accepted.";
  if (typeof body.system !== "string" || !app().prompts.has(body.system)) return own;
  const oc = body.output_config as { format?: unknown } | undefined;
  if (!oc || typeof oc !== "object" || JSON.stringify(oc.format) !== app().format) return own;
  if (!Array.isArray(body.messages) || body.messages.length !== 1 || (body.messages[0] as { role?: unknown })?.role !== "user") return own;
  return null;
}

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function unitsOf(model: string, u: Usage): number {
  const base = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.output_tokens ?? 0) * 5;
  return Math.ceil(base * (MODEL_WEIGHT[model] ?? 5));
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/**
 * Units set aside while a request runs: its largest possible answer plus a rough guess at the input.
 * Counted before the request goes out, so many requests sent at once can't all slip under the limit.
 */
export function reserveUnits(model: string, maxTokens: number, bodyLength: number): number {
  return unitsOf(model, { input_tokens: Math.min(Math.ceil(bodyLength / 4), 100_000), output_tokens: maxTokens });
}

// ---- Counters ---------------------------------------------------------------

type Cmd = (string | number)[];

const memory = new Map<string, { n: number; until: number }>();

async function redis(cmds: Cmd[]): Promise<(number | null)[]> {
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const out = (await res.json()) as { result: unknown }[];
    return out.map((r) => (r.result == null ? null : Number(r.result)));
  }
  // In-memory fallback with the same three commands.
  const now = Date.now();
  return cmds.map(([op, key, arg]) => {
    const k = String(key);
    let e = memory.get(k);
    if (e && e.until < now) e = undefined;
    if (op === "GET") return e?.n ?? null;
    if (op === "INCRBY") {
      e = { n: (e?.n ?? 0) + Number(arg), until: e?.until ?? now + 2 * 86_400_000 };
      memory.set(k, e);
      return e.n;
    }
    if (op === "EXPIRE" && e) e.until = now + Number(arg) * 1000;
    return 1;
  });
}

const day = () => new Date().toISOString().slice(0, 10);
const keys = (install: string, ip: string) => {
  const d = day();
  return { install: `kq:i:${d}:${install}`, ip: `kq:a:${d}:${ip}`, global: `kq:g:${d}`, minute: `kq:m:${Math.floor(Date.now() / 60_000)}:${ip}` };
};

export type Verdict = "install" | "ip" | "global" | "minute";

/**
 * Sets `reserve` units aside on the install, IP and global counters and returns which limit was
 * already crossed (giving the units back), or null. Also counts the request toward the per-minute
 * limit. Throws when the counters can't be reached: the caller then refuses the request, so an
 * outage of the counter store doesn't lift the limits.
 */
export async function checkQuota(install: string, ip: string, reserve: number): Promise<Verdict | null> {
  const k = keys(install, ip);
  const ttl = 172_800;
  const [i, , a, , g, , m] = await redis([
    ["INCRBY", k.install, reserve], ["EXPIRE", k.install, ttl],
    ["INCRBY", k.ip, reserve], ["EXPIRE", k.ip, ttl],
    ["INCRBY", k.global, reserve], ["EXPIRE", k.global, ttl],
    ["INCRBY", k.minute, 1], ["EXPIRE", k.minute, 120],
  ]);
  const before = (n: number | null) => (n ?? reserve) - reserve;
  const verdict: Verdict | null =
    before(g) >= LIMITS.global() ? "global"
    : before(i) >= LIMITS.install() ? "install"
    : before(a) >= LIMITS.ip() ? "ip"
    : (m ?? 0) > LIMITS.ipPerMinute() ? "minute"
    : null;
  if (verdict) await settleUsage(install, ip, reserve, 0).catch((e) => console.error("quota refund failed", e));
  return verdict;
}

/** Replaces the reserved units with what the request really cost (0 if it failed). */
export async function settleUsage(install: string, ip: string, reserved: number, actual: number): Promise<void> {
  const d = actual - reserved;
  if (!d) return;
  const k = keys(install, ip);
  await redis([["INCRBY", k.install, d], ["INCRBY", k.ip, d], ["INCRBY", k.global, d]]);
}

/** How much of today's allowance this install has used, for the Settings screen. */
export async function usageToday(install: string): Promise<{ used: number; limit: number }> {
  const [i] = await redis([["GET", keys(install, "").install]]);
  return { used: i ?? 0, limit: LIMITS.install() };
}

export function quotaError(v: Verdict, json: (status: number, type: string, message: string, extra?: Record<string, string>) => Response): Response {
  if (v === "minute") return json(429, "rate_limit_error", "Too many requests, slow down.", { "retry-after": "20", "x-should-retry": "true" });
  const secondsToMidnight = String(Math.ceil((Date.parse(day() + "T00:00:00Z") + 86_400_000 - Date.now()) / 1000));
  return json(429, v === "global" ? "kipple_quota_global" : "kipple_quota", "Today's free allowance is used up.", { "retry-after": secondsToMidnight });
}
