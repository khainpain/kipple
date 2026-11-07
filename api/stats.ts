// Vercel function: the statistics totals, for the weekly report. Needs the KIPPLE_STATS_TOKEN
// environment variable and `Authorization: Bearer <it>`; without the variable it is switched off.
// ?days=28 (up to 120) daily totals, plus the weekly totals and downloads of the same period,
// and the built-in AI key's cost: ku:d:<day> tokens and dollars by model and request kind,
// ku:m:<month> users and dollars per user (api/_lib/aiUsage.ts).
import { env } from "./_lib/quota.js";
import { isoWeek } from "../src/lib/telemetryEvents.js";
import { summarizeMonth } from "./_lib/aiUsage.js";

async function hgetall(keys: string[]): Promise<Record<string, Record<string, number>>> {
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("no counter store");
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(keys.map((k) => ["HGETALL", k])),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = (await res.json()) as { result: string[] | null }[];
  const all: Record<string, Record<string, number>> = {};
  out.forEach((r, i) => {
    const flat = r.result ?? [];
    if (!flat.length) return;
    const h: Record<string, number> = {};
    for (let j = 0; j + 1 < flat.length; j += 2) h[flat[j]] = Number(flat[j + 1]);
    all[keys[i]] = h;
  });
  return all;
}

export async function GET(request: Request): Promise<Response> {
  const secret = env("KIPPLE_STATS_TOKEN");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("not found", { status: 404 });
  const days = Math.min(120, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 28));
  const keys = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    const day = d.toISOString().slice(0, 10);
    keys.add(`kt:d:${day}`);
    keys.add(`kt:dl:${day}`);
    keys.add(`kt:w:${isoWeek(d)}`);
    keys.add(`ku:d:${day}`);
    keys.add(`ku:m:${day.slice(0, 7)}`);
  }
  try {
    const all = await hgetall([...keys].sort());
    for (const k of Object.keys(all)) if (k.startsWith("ku:m:")) all[k] = summarizeMonth(all[k]);
    return new Response(JSON.stringify(all), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return new Response(String(e), { status: 503 });
  }
}
