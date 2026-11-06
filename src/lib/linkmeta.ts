import { fetch } from "@tauri-apps/plugin-http";
import type { LinkMeta } from "./types";

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

async function oembed(url: string): Promise<Omit<LinkMeta, "fetchedAt"> | null> {
  const host = new URL(url).hostname;
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return null;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { connectTimeout: 8000 });
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return { url, title: j.title, description: j.author_name, image: j.thumbnail_url, siteName: "YouTube", favicon: "https://www.youtube.com/favicon.ico" };
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  const fetchedAt = new Date().toISOString();
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { url, error: "skipped", fetchedAt };
    const viaOembed = await oembed(url).catch(() => null);
    if (viaOembed) return { ...viaOembed, fetchedAt };
    const res = await fetch(url, {
      connectTimeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SavedBoard/0.1; link preview)", Accept: "text/html,*/*;q=0.5" },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { url, error: `HTTP ${res.status}`, fetchedAt };
    if (!type.includes("html")) return { url, title: decodeURIComponent(u.pathname.split("/").pop() || u.hostname), siteName: u.hostname, fetchedAt };
    const html = (await res.text()).slice(0, MAX_HTML);
    return { ...parseHtml(html, res.url || url), fetchedAt };
  } catch (e) {
    return { url, error: String(e).slice(0, 200), fetchedAt };
  }
}
