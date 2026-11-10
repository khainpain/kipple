// Vercel function: the desktop app's anonymous daily ping (src/lib/telemetry.ts). Adds it to
// daily and weekly totals in Upstash (api/_lib/stats.ts). Keeps no single ping and no IP address.
//
// So the totals can't be pumped up: the body must be sent as JSON (a page on another site then
// needs a CORS preflight, which this function never answers), and only a few pings a day from one
// address are counted (api/_lib/limit.ts keeps a short hash, not the address). Pings beyond that
// still get 204, so the app doesn't keep retrying them.
import { clientIp, redis } from "./_lib/quota.js";
import { withinLimit } from "./_lib/limit.js";
import { MAX_PING_BYTES, parsePing, pingCommands } from "./_lib/stats.js";

/** Installs behind one address (a family, an office) each ping once a day. */
const PINGS_PER_IP_PER_DAY = 5;

const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get("content-type") ?? "")) return new Response(null, { status: 415 });
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_PING_BYTES) return new Response(null, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const ping = parsePing(body);
  if (!ping) return new Response(null, { status: 400 });
  try {
    if (!(await withinLimit("ping", clientIp(request), PINGS_PER_IP_PER_DAY, 86_400))) return done();
    await redis(pingCommands(ping));
  } catch (e) {
    console.error("stats unavailable", e);
    return new Response(null, { status: 503 });
  }
  return done();
}
