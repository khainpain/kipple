// Vercel function for the browser build: fetches a page or picture for a link preview,
// because browsers don't let a site read other sites. It gets only the link itself,
// keeps nothing, and answers only pages of this same site. The desktop app doesn't use it.
import { lookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_BYTES = 2_000_000;
const ALLOWED_TYPE = /^(text\/html|application\/xhtml\+xml|application\/json|image\/)/i;
const UA = "Mozilla/5.0 (compatible; Kipple/0.1; link preview)";

function privateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** An IPv6 address as eight 16-bit numbers, or null. */
function v6groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  // A dotted IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[1].split(".").map(Number);
    s = s.slice(0, -tail[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined && rest ? rest.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - r.length : 0;
  const all = [...h, ...Array(fill).fill("0"), ...r].map((g) => parseInt(g, 16));
  return all.length === 8 && all.every((n) => n >= 0 && n <= 0xffff) ? all : null;
}

/** Loopback, private, link-local, multicast and other addresses that aren't the public internet. */
export function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const g = v6groups(ip);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.slice(0, 6).every((n) => n === 0)) return g[6] === 0 && g[7] <= 1 ? true : privateV4(v4(g[6], g[7])); // ::, ::1, ::a.b.c.d
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return privateV4(v4(g[6], g[7])); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(v4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return privateV4(v4(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
}

/**
 * DNS lookup for the outgoing connection that refuses private addresses. Checking at connect
 * time (not with a separate lookup first) means a name can't resolve to a public address for
 * the check and to a private one for the request.
 */
function publicLookup(host: string, opts: object, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) {
  lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err, []);
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return cb(new Error("private address"), []);
    if ((opts as { all?: boolean }).all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function publicUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) return null;
  if (isIP(host) && privateIp(host)) return null;
  return u;
}

/** One GET without following redirects, connecting only to public addresses. */
function get(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        lookup: publicLookup as never,
        timeout: 8000,
        headers: { "user-agent": UA, accept: "text/html,application/json,image/*;q=0.9,*/*;q=0.5", "accept-language": "en,ru;q=0.8", "accept-encoding": "identity" },
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(request: Request): Promise<Response> {
  // Browsers mark requests from other sites; refuse those so this isn't an open proxy for them.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return text(403, "forbidden");

  let target = publicUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!target) return text(400, "bad url");

  let res: IncomingMessage | undefined;
  for (let hop = 0; hop < 5; hop++) {
    res = await get(target).catch(() => undefined);
    if (!res) return text(502, "fetch failed");
    const status = res.statusCode ?? 502;
    const loc = res.headers.location;
    if (status < 300 || status >= 400 || !loc) break;
    res.resume();
    target = publicUrl(new URL(loc, target).toString());
    if (!target) return text(400, "bad redirect");
  }
  const status = res?.statusCode ?? 502;
  if (!res || (status >= 300 && status < 400)) {
    res?.destroy();
    return text(508, "too many redirects");
  }

  const type = String(res.headers["content-type"] ?? "application/octet-stream");
  const ok = status >= 200 && status < 300;
  const headers = new Headers({
    "content-type": type,
    "x-final-url": target.toString(),
    // Same link from any visitor → served from Vercel's cache for a week.
    "cache-control": ok ? "public, max-age=86400, s-maxage=604800" : "public, s-maxage=3600",
    "x-content-type-options": "nosniff",
  });
  if (status < 200 || status > 599) {
    res.destroy();
    return text(502, "bad status");
  }
  if (!ALLOWED_TYPE.test(type) || status === 204 || status === 205 || status === 304) {
    res.destroy();
    return new Response(null, { status, headers });
  }

  // Read at most MAX_BYTES: enough for a page's <head> or a preview picture.
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of res as AsyncIterable<Buffer>) {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= MAX_BYTES) {
        res.destroy();
        if (type.startsWith("image/")) return text(413, "image too large");
        break;
      }
    }
  } catch {
    if (!size) return text(502, "fetch failed");
  }
  const body = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    body.set(c, off);
    off += c.length;
  }
  return new Response(body.subarray(0, Math.min(size, MAX_BYTES)), { status, headers });
}
