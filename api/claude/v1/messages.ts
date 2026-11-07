// Vercel function: the built-in Anthropic key. The app sends its tagging and picture-naming
// requests here unless the user saved their own key; this adds the key (ANTHROPIC_API_KEY,
// set in the Vercel project settings, never in the repository or the app) and forwards
// the request to Anthropic. The message text passes through but is never stored or logged.
//
// It only takes what the app itself sends: the allowed models, the app's own system prompts,
// no tools, a capped max_tokens. Each install has a daily allowance, and all installs together
// a global one, so a copied install id or a scripted client can't run up the bill.
// Token counts and cost are added to totals (api/_lib/aiUsage.ts) — numbers only, no text.
// The SDK in the app calls `${baseURL}/v1/messages`, hence this path.
import { allowedRequest, checkQuota, clientIp, env, quotaError, redis, reserveUnits, settleUsage, unitsOf, type Usage } from "../../_lib/quota.js";
import { itemCount, requestKind, usageCommands } from "../../_lib/aiUsage.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_BODY = 4_000_000; // Vercel takes 4.5 MB; six shrunk photos are well under 1 MB

const json = (status: number, type: string, message: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    // x-should-retry: the Anthropic SDK in the app would otherwise retry a 429 or 5xx on its own.
    headers: { "content-type": "application/json", "x-should-retry": "false", ...extra },
  });

export async function POST(request: Request): Promise<Response> {
  // Browsers mark requests from other sites; the web build is same-origin and the desktop app
  // (Tauri's HTTP client) sends no such header. Other sites can't use this from their pages.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json(403, "forbidden", "Requests from other sites are not accepted.");

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return json(503, "kipple_unavailable", "The built-in key is not set up yet.");

  const install = request.headers.get("x-kipple-install") ?? "";
  if (!/^[A-Za-z0-9-]{16,64}$/.test(install)) return json(400, "invalid_request_error", "Missing install id.");

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, "request_too_large", "Request too large.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, "invalid_request_error", "Bad JSON.");
  }
  const problem = allowedRequest(body);
  if (problem) return json(400, "invalid_request_error", problem);

  const ip = clientIp(request);
  const model = String(body.model);
  const reserved = reserveUnits(model, body.max_tokens as number, raw.length);
  let verdict;
  try {
    verdict = await checkQuota(install, ip, reserved);
  } catch (e) {
    // The counters are unreachable: refuse rather than run without limits.
    console.error("quota check failed", e);
    return json(503, "api_error", "Usage counting is unavailable, try again later.", { "x-should-retry": "true", "retry-after": "30" });
  }
  if (verdict) return quotaError(verdict, json);
  // From here on the reserved units are replaced with the real cost exactly once.
  let actual = 0;
  const settle = () => settleUsage(install, ip, reserved, actual).catch((e) => console.error("usage accounting failed", e));

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": request.headers.get("anthropic-version") ?? "2023-06-01",
    },
    body: raw,
    signal: AbortSignal.timeout(280_000),
  }).catch(() => undefined);
  if (!res) {
    await settle();
    return json(502, "api_error", "Anthropic did not answer.", { "x-should-retry": "true" });
  }

  const text = await res.text().catch(() => "");
  let usage: Usage | undefined;
  if (res.ok) {
    try {
      usage = (JSON.parse(text) as { usage?: Usage }).usage;
      // No usage in a successful answer shouldn't happen; keep the reservation then.
      actual = usage ? unitsOf(model, usage) : reserved;
    } catch {
      actual = reserved;
    }
  }
  await settle();
  const kind = requestKind(body.system);
  await redis(usageCommands({ model, kind, items: itemCount(kind, body), usage, ok: res.ok, install }))
    .catch((e) => console.error("usage totals failed", e));
  if (res.status === 401 || res.status === 403) {
    // Our key, not the user's: don't let the app tell them their key is wrong.
    console.error("built-in Anthropic key rejected", res.status);
    return json(503, "kipple_unavailable", "The built-in key is not working right now.");
  }
  const headers = new Headers({ "content-type": res.headers.get("content-type") ?? "application/json" });
  for (const h of ["request-id", "retry-after", "x-should-retry"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(text, { status: res.status, headers });
}
