// Vercel function: the desktop app's anonymous daily ping (src/lib/telemetry.ts). Adds it to
// daily and weekly totals in Upstash (api/_lib/stats.ts). Keeps no single ping and no IP address.
import { redis } from "./_lib/quota";
import { MAX_PING_BYTES, parsePing, pingCommands } from "./_lib/stats";

export async function POST(request: Request): Promise<Response> {
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
    await redis(pingCommands(ping));
  } catch (e) {
    console.error("stats unavailable", e);
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
