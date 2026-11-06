// Vercel function: how much of today's built-in-key allowance this install has used,
// for the Settings screen. Takes only the install id; returns two numbers.
import { usageToday } from "../_lib/quota";

export async function GET(request: Request): Promise<Response> {
  const install = request.headers.get("x-kipple-install") ?? "";
  if (!/^[A-Za-z0-9-]{16,64}$/.test(install)) return new Response("missing install id", { status: 400 });
  try {
    const u = await usageToday(install);
    return new Response(JSON.stringify(u), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
