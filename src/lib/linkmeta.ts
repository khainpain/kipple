import { T } from "../i18n";
import { platform } from "@platform";

const fetch = platform.httpFetch;
import type { Card, LinkMeta } from "./types";
import { instagramCode, wantsImage, youtubeId, youtubeThumb } from "./embeds";

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$)/i;
const MAX_HTML = 600_000;

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

export function parseHtml(html: string, url: string): Omit<LinkMeta, "fetchedAt"> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const icon = doc.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')?.getAttribute("href") ?? "/favicon.ico";
  doc.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((n) => n.remove());
  const main = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const excerpt = (main?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return {
    url,
    title: meta(doc, "og:title", "twitter:title") ?? doc.title?.trim() ?? undefined,
    description: meta(doc, "og:description", "twitter:description", "description"),
    image: absolute(meta(doc, "og:image", "og:image:url", "twitter:image"), url),
    siteName: meta(doc, "og:site_name"),
    favicon: absolute(icon, url),
    excerpt: excerpt || undefined,
  };
}

const UA = "Mozilla/5.0 (compatible; SavedBoard/0.1; link preview)";
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
    const res = await fetch(src, { connectTimeout: 8000, headers: { "User-Agent": UA } });
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
  const res = await fetch(url, { connectTimeout: 8000, headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" } });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  return { html: (await res.text()).slice(0, MAX_HTML), url: finalUrl(res, url) };
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

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  const fetchedAt = new Date().toISOString();
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { url, error: "skipped", fetchedAt };
    const yt = youtubeId(url);
    if (yt) return { ...(await youtube(url, yt)), fetchedAt };
    const ig = instagramCode(url);
    if (ig) return { ...(await instagram(url, ig)), fetchedAt };
    const res = await fetch(url, {
      connectTimeout: 8000,
      headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { url, error: `HTTP ${res.status}`, fetchedAt };
    if (!type.includes("html")) return { url, title: decodeURIComponent(u.pathname.split("/").pop() || u.hostname), siteName: u.hostname, fetchedAt };
    const html = (await res.text()).slice(0, MAX_HTML);
    return { ...parseHtml(html, finalUrl(res, url)), fetchedAt };
  } catch (e) {
    return { url, error: String(e).slice(0, 200), fetchedAt };
  }
}

const DAY = 86_400_000;

/** Cards whose preview is missing, or YouTube/Instagram ones an older version left without a picture. */
export function needsPreview(c: Card): boolean {
  if (c.kind !== "link" || !c.urls[0] || c.removed) return false;
  if (!c.link) return true;
  if (c.link.image || c.link.error === "skipped" || !wantsImage(c.urls[0])) return false;
  return Date.now() - Date.parse(c.link.fetchedAt || "0") > DAY;
}
