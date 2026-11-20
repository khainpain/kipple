import { T } from "../i18n";
import { platform } from "@platform";

const fetch = platform.httpFetch;
import type { Card, LinkMeta } from "./types";
import type { PreviewResponse } from "../platform/types";
import { publicAssetUrl } from "./assetUrl";
import { instagramCode, tiktokId, tiktokShort, wantsImage, youtubeId, youtubeThumb } from "./embeds";

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$)/i;
const MAX_HTML = 600_000;

/** The link (or a redirect) leads into the user's own network: never fetched. */
export class PrivateHostError extends Error {
  constructor(host: string) {
    super(`private address: ${host}`);
  }
}

type FetchInit = Parameters<typeof fetch>[1];

/** previewFetch's answer as a Response; statuses that can't carry a body get none. */
export function previewResponse(r: PreviewResponse): Response {
  const bin = atob(r.body);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const status = r.status >= 200 && r.status <= 599 ? r.status : 502;
  const empty = status === 204 || status === 205 || status === 304;
  return new Response(empty ? null : bytes, { status, headers: { "content-type": r.contentType, "x-final-url": r.url } });
}

/**
 * Desktop: Rust's preview_fetch, which talks to sites directly and refuses every address (the
 * first, each redirect, and the one it actually connects to) inside the user's network.
 * Browser: /api/fetch already refuses private addresses, redirects included.
 */
async function get(url: string, init: FetchInit): Promise<{ res: Response; url: string }> {
  if (platform.previewFetch) {
    const accept = new Headers(init?.headers).get("accept") ?? undefined;
    const r = await platform.previewFetch(url, accept).catch((e: unknown) => {
      throw String(e).includes("PRIVATE_HOST") ? new PrivateHostError(new URL(url).hostname) : e;
    });
    return { res: previewResponse(r), url: r.url };
  }
  const res = await fetch(url, init);
  return { res, url: finalUrl(res, url) };
}

function meta(doc: Document, ...names: string[]): string | undefined {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    const v = el?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return undefined;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * The page's preview picture: og:image and its cousins, else the first sizeable picture of
 * the article (blogs without social tags usually lead with one).
 */
function pageImage(doc: Document): string | undefined {
  const tagged =
    meta(doc, "og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src") ??
    doc.querySelector('link[rel="image_src"]')?.getAttribute("href") ??
    doc.querySelector('meta[itemprop="image"]')?.getAttribute("content") ??
    undefined;
  if (tagged?.trim()) return tagged.trim();
  for (const img of Array.from(doc.querySelectorAll("article img"))) {
    const src = img.getAttribute("src")?.trim();
    const w = Number(img.getAttribute("width"));
    if (!src || /^data:|\.svg(\?|$)/i.test(src) || (w && w < 200)) continue;
    return src;
  }
  return undefined;
}

/** Bump when parseHtml learns to find more: links saved without a picture are tried once more. */
export const PARSE_VERSION = 2;

export function parseHtml(html: string, url: string): Omit<LinkMeta, "fetchedAt"> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const image = pageImage(doc);
  const icon = doc.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')?.getAttribute("href") ?? "/favicon.ico";
  doc.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((n) => n.remove());
  const main = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const excerpt = (main?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return {
    url,
    title: meta(doc, "og:title", "twitter:title") ?? doc.title?.trim() ?? undefined,
    description: meta(doc, "og:description", "twitter:description", "description"),
    image: publicAssetUrl(absolute(image, url)),
    siteName: meta(doc, "og:site_name"),
    favicon: publicAssetUrl(absolute(icon, url)),
    excerpt: excerpt || undefined,
  };
}

const UA = "Mozilla/5.0 (compatible; Kipple/0.1; link preview)";
/** The address the response came from after redirects; the web proxy passes it in a header. */
const finalUrl = (res: Response, url: string) => res.headers.get("x-final-url") || res.url || url;

async function youtube(url: string, id: string): Promise<Omit<LinkMeta, "fetchedAt">> {
  const base = { url, image: youtubeThumb(id), siteName: "YouTube", favicon: "https://www.youtube.com/favicon.ico" };
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { connectTimeout: 8000 });
    if (!res.ok) return base;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return { ...base, title: j.title, description: j.author_name };
  } catch {
    return base; // the thumbnail alone is still a fine preview
  }
}

/**
 * Downloads a picture and keeps a small copy inside the library. Needed for Instagram:
 * its image links expire after a few days and refuse to load inside other sites.
 */
async function inlineImage(src: string): Promise<string | undefined> {
  try {
    const { res } = await get(src, { connectTimeout: 8000, headers: { "User-Agent": UA } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return undefined;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, 480 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

async function getHtml(url: string): Promise<{ html: string; url: string } | null> {
  const { res, url: at } = await get(url, { connectTimeout: 8000, headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" } });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  return { html: (await res.text()).slice(0, MAX_HTML), url: at };
}

/** Post page first; if Instagram hides it behind a login, the public embed page still has the picture and caption. */
async function instagram(url: string, code: string): Promise<Omit<LinkMeta, "fetchedAt">> {
  const base = { url, siteName: "Instagram", favicon: "https://www.instagram.com/favicon.ico" };
  let meta: Omit<LinkMeta, "fetchedAt"> = base;
  const page = await getHtml(url).catch(() => null);
  if (page) meta = { ...parseHtml(page.html, page.url), ...base };
  if (!meta.image) {
    const embed = await getHtml(`https://www.instagram.com/p/${code}/embed/captioned/`).catch(() => null);
    if (embed) {
      const doc = new DOMParser().parseFromString(embed.html, "text/html");
      const img = doc.querySelector("img.EmbeddedMediaImage, .EmbeddedMedia img")?.getAttribute("src") ?? undefined;
      const caption = doc.querySelector(".Caption")?.textContent?.replace(/\s+/g, " ").trim();
      const author = doc.querySelector(".UsernameText, .Username")?.textContent?.trim();
      meta = { ...meta, image: img, title: meta.title ?? (author ? T.linkmeta.onInstagram(author) : undefined), description: meta.description ?? caption?.slice(0, 500) };
    }
  }
  if (meta.image) meta.image = await inlineImage(meta.image);
  return meta;
}

/**
 * TikTok pages show bots no cover, so the cover, title and author come from its oEmbed. A short
 * share link is followed first, and the video's own address is kept so the card can play it.
 * The cover is a signed link that expires, so a small copy is kept like Instagram's.
 */
async function tiktok(url: string): Promise<Omit<LinkMeta, "fetchedAt"> | undefined> {
  let at = url;
  if (!tiktokId(url)) {
    const page = await getHtml(url);
    if (!page) return undefined;
    at = page.url;
    if (!tiktokId(at)) return parseHtml(page.html, at); // a profile or a photo post: an ordinary page
  }
  const u = new URL(at);
  const video = `https://www.tiktok.com${u.pathname}`;
  const base = { url: video, siteName: "TikTok", favicon: "https://www.tiktok.com/favicon.ico" };
  try {
    const { res } = await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(video)}`, { connectTimeout: 8000, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` }; // 404: deleted or private; 429/5xx: tried again tomorrow
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    const image = j.thumbnail_url ? await inlineImage(j.thumbnail_url) : undefined;
    return { ...base, title: j.title?.trim() || undefined, description: j.author_name, image };
  } catch {
    return base; // the player still works without a cover
  }
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  return { ...(await fetchMeta(url)), fetchedAt: new Date().toISOString(), v: PARSE_VERSION };
}

async function fetchMeta(url: string): Promise<Omit<LinkMeta, "fetchedAt">> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { url, error: "skipped" };
    const yt = youtubeId(url);
    if (yt) return await youtube(url, yt);
    const ig = instagramCode(url);
    if (ig) return await instagram(url, ig);
    if (tiktokId(url) || tiktokShort(url)) {
      const tt = await tiktok(url);
      if (tt) return tt;
    }
    const { res, url: at } = await get(url, {
      connectTimeout: 8000,
      headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    if (!type.includes("html")) return { url, title: decodeURIComponent(u.pathname.split("/").pop() || u.hostname), siteName: u.hostname };
    const html = (await res.text()).slice(0, MAX_HTML);
    return parseHtml(html, at);
  } catch (e) {
    if (e instanceof PrivateHostError) return { url, error: "private" }; // tried again later: networks change
    return { url, error: String(e).slice(0, 200) };
  }
}

/**
 * One plain request to a saved link for "Check links": its status, or why there was none.
 * Same route as a preview (private addresses refused), and nothing is parsed or kept.
 */
export async function probeLink(url: string): Promise<{ status?: number; error?: string }> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { error: "skipped" };
    const { res } = await get(url, { connectTimeout: 8000, headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" } });
    // Only the site's own answer carries x-final-url (Rust and /api/fetch both set it); anything
    // else is the route failing (no /api/fetch, its own refusal), which says nothing about the link.
    if (!res.headers.has("x-final-url")) return { error: `no answer from the site (HTTP ${res.status})` };
    // Single-page sites on static hosting answer 404 to every path and draw the page in the
    // browser: when the "missing" page is the very same HTML as the home page, it says nothing.
    if ((res.status === 404 || res.status === 410) && (res.headers.get("content-type") ?? "").includes("html") && u.pathname !== "/") {
      const page = await res.text();
      const home = await get(u.origin + "/", { connectTimeout: 8000, headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" } }).catch(() => null);
      if (home?.res.ok && (await home.res.text()) === page) return { error: "app shell: the site answers 404 for every page" };
    }
    return { status: res.status };
  } catch (e) {
    return { error: e instanceof PrivateHostError ? "skipped" : String(e).slice(0, 200) };
  }
}

const DAY = 86_400_000;

/**
 * Cards whose preview is missing; ones an older version left without a picture (once); and
 * YouTube/Instagram ones without a picture (again after a day).
 */
export function needsPreview(c: Card): boolean {
  if (c.kind !== "link" || !c.urls[0] || c.removed) return false;
  if (!c.link) return true;
  if (c.link.image || c.link.error === "skipped") return false;
  // Passing problems (a home-network address, too many requests, a server error): again after a day.
  if (c.link.error === "private" || /^HTTP (429|5\d\d)$/.test(c.link.error ?? "")) return Date.now() - Date.parse(c.link.fetchedAt || "0") > DAY;
  if ((c.link.v ?? 1) < PARSE_VERSION) return true;
  if (/^HTTP 4(?!08|29)\d\d$/.test(c.link.error ?? "")) return false; // deleted or private: won't come back
  // A short link is judged by where it led: a TikTok profile, unlike a video, has no cover to wait for.
  if (!wantsImage(tiktokShort(c.urls[0]) ? c.link.url || c.urls[0] : c.urls[0])) return false;
  return Date.now() - Date.parse(c.link.fetchedAt || "0") > DAY;
}

/** How many cards the "Load previews" button would fetch; none while previews are off in Settings. */
export function previewsToLoad(cards: Card[], on: boolean): number {
  return on ? cards.filter(needsPreview).length : 0;
}
