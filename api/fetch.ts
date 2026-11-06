// Vercel function for the browser build: fetches a page or picture for a link preview,
// because browsers don't let a site read other sites. It gets only the link itself,
// keeps nothing, and answers only pages of this same site. The desktop app doesn't use it.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2_000_000;
const ALLOWED_TYPE = /^(text\/html|application\/xhtml\+xml|application\/json|image\/)/i;
const UA = "Mozilla/5.0 (compatible; SavedBoard/0.1; link preview)";

function privateIp(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function publicUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) return null;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
  return u;
}

const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(request: Request): Promise<Response> {
  // Browsers mark requests from other sites; refuse those so this isn't an open proxy for them.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return text(403, "forbidden");

  let target = await publicUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!target) return text(400, "bad url");

  let res: Response | undefined;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": UA, accept: "text/html,application/json,image/*;q=0.9,*/*;q=0.5", "accept-language": "en,ru;q=0.8" },
    }).catch(() => undefined);
    if (!res) return text(502, "fetch failed");
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) break;
    target = await publicUrl(new URL(loc, target).toString());
    if (!target) return text(400, "bad redirect");
  }
  if (!res || (res.status >= 300 && res.status < 400)) return text(508, "too many redirects");

  const type = res.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "content-type": type,
    "x-final-url": target.toString(),
    // Same link from any visitor → served from Vercel's cache for a week.
    "cache-control": res.ok ? "public, max-age=86400, s-maxage=604800" : "public, s-maxage=3600",
    "x-content-type-options": "nosniff",
  });
  if (!ALLOWED_TYPE.test(type)) {
    void res.body?.cancel();
    return new Response(null, { status: res.status, headers });
  }

  // Read at most MAX_BYTES: enough for a page's <head> or a preview picture.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX_BYTES) {
      void reader.cancel();
      if (type.startsWith("image/")) return text(413, "image too large");
      break;
    }
  }
  const body = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    body.set(c, off);
    off += c.length;
  }
  return new Response(body.subarray(0, Math.min(size, MAX_BYTES)), { status: res.status, headers });
}
