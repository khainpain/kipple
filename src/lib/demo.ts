// Sample library for the demo: a made-up Saved Messages archive that looks like a real one, with
// every kind of message Kipple reads and something for each thing it does without AI (topics by
// site, piles on the cleanup screen, copies, junk, passwords kept apart, dead links).
import { annotateContext, effectiveTopic } from "./library";
import { isAutoJunk, isSensitive } from "./rules";
import { cardEmbed, linkText } from "./embeds";
import type { Card, Library, MediaRef } from "./types";
import type { DemoScene, DemoSpec } from "./demoSpec";
import { T } from "../i18n";

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;");

/**
 * Earthy hues that sit next to Kipple's coral, cream and ink: terracotta, ochre, olive, sage,
 * teal, slate, plum, sand. Kept muted so screenshots of the demo stay calm.
 */
const HUES = [14, 38, 70, 140, 178, 212, 330, 28];
const hueAt = (seed: number) => HUES[Math.abs(seed) % HUES.length];

/** Splits a headline into lines of about `max` characters, at most three. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines.length > 3 ? [...lines.slice(0, 2), lines[2] + "…"] : lines;
}

/**
 * A made-up link preview in the style of a site's og:image: a tinted picture with soft shapes,
 * the headline and the site. Drawn here, so the demo needs nothing from the network.
 */
function ogImage(seed: number, title: string, site: string): string {
  const h = hueAt(seed);
  const h2 = (h + 18) % 360;
  const lines = wrap(title, 20);
  const top = 315 - (lines.length * 68) / 2 + 48;
  const text = lines.map((l, k) => `<tspan x='150' y='${top + k * 68}'>${xml(l)}</tspan>`).join("");
  const cx = 860 + ((seed * 31) % 160);
  const cy = 200 + ((seed * 17) % 220);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h},22%,22%)'/><stop offset='1' stop-color='hsl(${h2},26%,34%)'/></linearGradient></defs>` +
      `<rect width='1200' height='630' fill='url(#g)'/>` +
      `<circle cx='${cx}' cy='${cy}' r='230' fill='hsl(${h2},35%,60%)' opacity='.3'/>` +
      `<circle cx='${cx + 120}' cy='${cy + 190}' r='130' fill='hsl(${h},40%,72%)' opacity='.22'/>` +
      `<rect x='${cx - 150}' y='${cy - 40}' width='260' height='170' rx='22' fill='hsl(${h},30%,92%)' opacity='.18' transform='rotate(-8 ${cx} ${cy})'/>` +
      `<text font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='56' font-weight='700' fill='white' letter-spacing='-1'>${text}</text>` +
      `<text x='150' y='110' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='26' font-weight='600' fill='white' opacity='.75'>${xml(site)}</text>` +
      `<rect x='150' y='520' width='64' height='6' rx='3' fill='white' opacity='.6'/>` +
      `</svg>`,
  )}`;
}

const svg = (w: number, h: number, body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}`;

/** Made-up pictures for the demo's photos and video frames, one painter per scene. */
const SCENES: Record<DemoScene, (hue: number, w: number, h: number, seed: number) => string> = {
  // A landscape with a sun.
  hills: (hue, w, h) =>
    `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='hsl(${hue},28%,74%)'/><stop offset='1' stop-color='hsl(${(hue + 20) % 360},35%,88%)'/></linearGradient></defs>` +
    `<rect width='100%' height='100%' fill='url(#s)'/>` +
    `<circle cx='${w * 0.68}' cy='${h * 0.42}' r='${h * 0.14}' fill='hsl(36,60%,94%)'/>` +
    `<path d='M0 ${h * 0.62} Q ${w * 0.25} ${h * 0.5} ${w * 0.5} ${h * 0.6} T ${w} ${h * 0.56} V ${h} H 0 Z' fill='hsl(${(hue + 160) % 360},16%,40%)'/>` +
    `<path d='M0 ${h * 0.76} Q ${w * 0.3} ${h * 0.68} ${w * 0.6} ${h * 0.78} T ${w} ${h * 0.74} V ${h} H 0 Z' fill='hsl(${(hue + 170) % 360},18%,27%)'/>`,
  // Rooftops at dusk.
  city: (hue, w, h, seed) => {
    const n = 9;
    const houses = Array.from({ length: n }, (_, k) => {
      const bw = w / n;
      const bh = h * (0.22 + (((seed + 3) * (k + 2) * 37) % 30) / 100);
      const lit = (seed + k) % 3 === 0;
      return (
        `<rect x='${k * bw}' y='${h - bh}' width='${bw + 1}' height='${bh}' fill='hsl(${(hue + 190 + k * 5) % 360},18%,${24 + ((k * 7) % 12)}%)'/>` +
        `<rect x='${k * bw + bw * 0.3}' y='${h - bh + bw * 0.3}' width='${bw * 0.16}' height='${bw * 0.22}' fill='hsl(40,70%,${lit ? 78 : 40}%)' opacity='.8'/>` +
        `<rect x='${k * bw + bw * 0.58}' y='${h - bh + bw * 0.7}' width='${bw * 0.16}' height='${bw * 0.22}' fill='hsl(40,70%,${lit ? 46 : 74}%)' opacity='.8'/>`
      );
    }).join("");
    return (
      `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='hsl(${(hue + 200) % 360},30%,52%)'/><stop offset='1' stop-color='hsl(${hue},55%,80%)'/></linearGradient></defs>` +
      `<rect width='100%' height='100%' fill='url(#s)'/><circle cx='${w * 0.24}' cy='${h * 0.3}' r='${h * 0.07}' fill='hsl(36,70%,92%)'/>${houses}`
    );
  },
  // Sea, sand and a parasol.
  sea: (hue, w, h) =>
    `<rect width='100%' height='100%' fill='hsl(${(hue + 180) % 360},38%,82%)'/>` +
    `<rect y='${h * 0.38}' width='100%' height='${h * 0.34}' fill='hsl(${(hue + 170) % 360},36%,52%)'/>` +
    `<path d='M0 ${h * 0.5} q ${w * 0.08} ${-h * 0.02} ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0' fill='none' stroke='white' stroke-width='${h * 0.008}' opacity='.5'/>` +
    `<path d='M0 ${h * 0.7} Q ${w * 0.4} ${h * 0.64} ${w} ${h * 0.72} V ${h} H 0 Z' fill='hsl(38,48%,82%)'/>` +
    `<path d='M${w * 0.3} ${h * 0.6} a ${h * 0.16} ${h * 0.16} 0 0 1 ${h * 0.32} 0 Z' fill='hsl(${hue},62%,58%)'/><rect x='${w * 0.3 + h * 0.155}' y='${h * 0.6}' width='${h * 0.01}' height='${h * 0.24}' fill='hsl(30,20%,30%)'/>`,
  // A plate from above, on a table.
  plate: (hue, w, h, seed) => {
    const r = Math.min(w, h) * 0.34;
    const [cx, cy] = [w * 0.5, h * 0.52];
    const bits = Array.from({ length: 7 }, (_, k) => {
      const a = (k * 0.9 + seed) % 6.28;
      const d = r * 0.42 * (((k * 5 + seed) % 7) / 7);
      return `<circle cx='${cx + Math.cos(a) * d}' cy='${cy + Math.sin(a) * d}' r='${r * (0.1 + (k % 3) * 0.04)}' fill='hsl(${(hue + k * 23) % 360},55%,${48 + (k % 3) * 9}%)'/>`;
    }).join("");
    return (
      `<rect width='100%' height='100%' fill='hsl(${(hue + 20) % 360},24%,34%)'/>` +
      `<rect x='${w * 0.06}' y='${h * 0.1}' width='${w * 0.2}' height='${h * 0.26}' rx='${w * 0.01}' fill='hsl(${(hue + 150) % 360},22%,62%)' transform='rotate(-8 ${w * 0.16} ${h * 0.23})'/>` +
      `<circle cx='${cx}' cy='${cy}' r='${r}' fill='hsl(40,30%,95%)'/><circle cx='${cx}' cy='${cy}' r='${r * 0.74}' fill='hsl(40,24%,89%)'/>${bits}`
    );
  },
  // A sheet of paper with handwriting, photographed on a desk.
  paper: (hue, w, h, seed) => {
    const lines = Array.from({ length: 9 }, (_, k) => `<rect x='${w * 0.26}' y='${h * (0.26 + k * 0.058)}' width='${w * (0.26 + (((seed + k) * 13) % 22) / 100)}' height='${h * 0.012}' rx='${h * 0.006}' fill='hsl(${(hue + 200) % 360},25%,34%)' opacity='.7'/>`).join("");
    return (
      `<rect width='100%' height='100%' fill='hsl(${(hue + 10) % 360},20%,42%)'/>` +
      `<g transform='rotate(-4 ${w / 2} ${h / 2})'><rect x='${w * 0.2}' y='${h * 0.12}' width='${w * 0.6}' height='${h * 0.76}' rx='${w * 0.008}' fill='hsl(44,45%,94%)'/>` +
      `<rect x='${w * 0.26}' y='${h * 0.18}' width='${w * 0.3}' height='${h * 0.028}' rx='${h * 0.014}' fill='hsl(${hue},55%,50%)'/>${lines}</g>`
    );
  },
  // A phone screenshot: a header, a picture, lines of text.
  screen: (hue, w, h, seed) => {
    const rows = Array.from({ length: 6 }, (_, k) => `<rect x='${w * 0.08}' y='${h * (0.5 + k * 0.07)}' width='${w * (0.5 + (((seed + k) * 17) % 34) / 100)}' height='${h * 0.022}' rx='${h * 0.011}' fill='hsl(${hue},12%,${k ? 78 : 40}%)'/>`).join("");
    return (
      `<rect width='100%' height='100%' fill='hsl(${hue},20%,97%)'/><rect width='100%' height='${h * 0.09}' fill='hsl(${hue},30%,90%)'/>` +
      `<circle cx='${w * 0.14}' cy='${h * 0.045}' r='${h * 0.022}' fill='hsl(${hue},40%,62%)'/><rect x='${w * 0.24}' y='${h * 0.034}' width='${w * 0.34}' height='${h * 0.022}' rx='${h * 0.011}' fill='hsl(${hue},18%,48%)'/>` +
      `<rect x='${w * 0.08}' y='${h * 0.14}' width='${w * 0.84}' height='${h * 0.3}' rx='${w * 0.04}' fill='hsl(${(hue + 150) % 360},30%,70%)'/><circle cx='${w * 0.72}' cy='${h * 0.24}' r='${h * 0.05}' fill='hsl(40,60%,92%)'/>${rows}`
    );
  },
};

function picture(scene: DemoScene, seed: number, w: number, h: number): string {
  return svg(w, h, SCENES[scene](hueAt(seed), w, h, seed));
}

// A one-page PDF and a text file, so the in-card previews can be tried in the browser build.
const DEMO_PDF = "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0MjAgMjk3XSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMDQgPj4Kc3RyZWFtCkJUIC9GMSAyMiBUZiA0MCAyMjAgVGQgKERlbW8gcmVwb3J0KSBUaiAwIC0zNiBUZCAvRjEgMTIgVGYgKFRoaXMgUERGIG9wZW5zIHJpZ2h0IGluc2lkZSB0aGUgY2FyZC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzk2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDY2CiUlRU9GCg==";

const MIME: Record<string, string> = { pdf: "application/pdf", txt: "text/plain", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", mp3: "audio/mpeg", mp4: "video/mp4", ogg: "audio/ogg" };
const mimeOf = (file: string | undefined) => MIME[file?.split(".").pop() ?? ""];

function mediaOf(s: DemoSpec, kind: Card["kind"], i: number, txt: string): MediaRef | undefined {
  // No two sizes alike, or the cards would look like copies of one file.
  const size = (s.kb ?? 180 + i * 7) * 1024 + i;
  if (kind === "photo") {
    const [w, h] = s.pic === "screen" ? [390, 844] : s.tall ? [900, 1200] : [1200, 800];
    return { path: picture(s.pic ?? "hills", i, w, h), width: w, height: h, size, missing: false };
  }
  if (kind === "video" || kind === "animation") return { thumb: picture(s.pic ?? "hills", i, 1280, 720), width: 1280, height: 720, duration: s.dur, size, mime: "video/mp4", fileName: s.file, missing: false };
  if (kind === "document") return { path: s.file?.endsWith(".pdf") ? DEMO_PDF : s.file?.endsWith(".txt") ? txt : undefined, fileName: s.file, mime: mimeOf(s.file), size, missing: false };
  if (kind === "voice" || kind === "video_note") return { duration: s.dur, size, mime: kind === "voice" ? "audio/ogg" : "video/mp4" };
  if (kind === "audio") return { fileName: s.file, duration: s.dur, size, mime: mimeOf(s.file) };
  return undefined;
}

function cardOf(s: DemoSpec, i: number, now: number, txt: string): Card {
  const kind = s.k ?? (s.url ? "link" : "text");
  const text = s.t ?? s.url ?? "";
  const c: Card = {
    id: 0,
    date: new Date(now - s.d * 864e5 - (i % 9) * 2_520_000).toISOString(),
    kind,
    text,
    urls: s.url ? [s.url] : [],
    hashtags: (text.match(/#[\p{L}\d_]{2,}/gu) ?? []).map((t) => t.slice(1).toLowerCase()),
    media: mediaOf(s, kind, i, txt),
    forwardedFrom: s.from,
  };
  if (kind === "photo" && s.album) c.album = Array.from({ length: s.album }, (_, k) => ({ path: picture(s.pic ?? "hills", i + k + 1, c.media!.width!, c.media!.height!), width: c.media!.width, height: c.media!.height }));
  if (kind === "link") {
    c.link = { url: s.url!, title: s.title, description: s.desc, siteName: s.site, fetchedAt: "", health: s.broken ? "broken" : "ok", checkedAt: new Date(now - 864e5).toISOString() };
    // A video keeps a frame for its cover, any other page a preview drawn from its title; nothing is asked of the network.
    const [w, h] = s.tall ? [720, 1280] : [1280, 720];
    c.link.image = s.pic ? picture(s.pic, i, w, h) : cardEmbed(c)?.video ? picture("hills", i, w, h) : ogImage(i, s.title?.split(/ [|:·] | - /)[0] ?? "", s.site ?? "");
  }
  if (isSensitive(text)) c.sensitive = true;
  else if (isAutoJunk(c)) c.autoJunk = true;
  if (s.topic || s.pin) c.user = { ...(s.topic && { topic: s.topic }), ...(s.pin && { pinned: true }) };
  // What the AI would have added, for the features that are frozen now: tags and a status. Its title is the page's
  // own (an Instagram one already cut down to the caption), so the card reads as it does without AI.
  const topic = effectiveTopic(c);
  if (topic && !c.sensitive) c.ai = { title: linkText(c.link).title ?? "", summary: "", topic, tags: s.tags ?? [topic.toLocaleLowerCase()], action: s.status ?? "reference", priority: 2, model: "demo", at: "" };
  return c;
}

export function demoLibrary(): Library {
  const D = T.demo;
  const now = Date.now();
  const txt = `data:text/plain;charset=utf-8,${encodeURIComponent(D.textBody)}`;
  const cards = D.cards.map((s, i) => cardOf(s, i, now, txt));
  // Message ids grow with time, as in Telegram; the library is kept newest first.
  cards.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((c, i) => (c.id = 1200 + i * 3));
  cards.reverse();
  annotateContext(cards);
  return { version: 1, chatName: D.chatName, sourceDir: "demo", importedAt: new Date().toISOString(), cards };
}
