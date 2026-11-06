// Sample library for the browser build's demo button: lets you see the grid without an export.
import fixture from "../../fixtures/saved_messages.json";
import { parseExport } from "./parser";
import { annotateContext } from "./library";
import type { Library } from "./types";
import { T } from "../i18n";

const swatch = (hue: number, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${hue},55%,70%)'/></svg>`)}`;

// A one-page PDF and a text file, so the in-card previews can be tried in the browser build.
const DEMO_PDF = "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0MjAgMjk3XSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMDQgPj4Kc3RyZWFtCkJUIC9GMSAyMiBUZiA0MCAyMjAgVGQgKERlbW8gcmVwb3J0KSBUaiAwIC0zNiBUZCAvRjEgMTIgVGYgKFRoaXMgUERGIG9wZW5zIHJpZ2h0IGluc2lkZSB0aGUgY2FyZC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzk2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDY2CiUlRU9GCg==";

export function demoLibrary(): Library {
  const base = parseExport(fixture).cards;
  const D = T.demo;
  const DEMO_TXT = `data:text/plain;charset=utf-8,${encodeURIComponent(D.textBody)}`;
  const topics = D.topics;
  const cards = Array.from({ length: 60 }, (_, i) => {
    const c = structuredClone(base[i % base.length]);
    c.id = i + 1;
    // The sample repeats; make the repeats distinct so only one pair shows up as a duplicate.
    if (i >= base.length && i !== base.length) {
      if (c.urls.length) c.urls = [`https://example.com/article-${i}`];
      if (c.media?.size) c.media = { ...c.media, size: c.media.size + i };
      else if (c.text) c.text += "\u200b".repeat(i); // invisible, but the texts no longer match
    }
    if (c.kind === "link") c.link = { url: c.urls[0], title: D.article(i), siteName: "example.com", image: i % 3 ? swatch(i * 37, 1200, 630) : undefined, fetchedAt: "" };
    if (c.kind === "photo") {
      c.link = undefined;
      const [w, h] = i % 2 ? [800, 1000] : [1200, 800];
      c.media = { ...c.media, path: swatch(i * 53, w, h), width: w, height: h, missing: false };
      c.album = undefined;
    }
    if (c.kind === "document") {
      const txt = i % 2 === 1;
      c.media = { ...c.media, path: txt ? DEMO_TXT : DEMO_PDF, fileName: txt ? D.textFile : "report.pdf", mime: txt ? "text/plain" : "application/pdf", missing: false };
    }
    // Some photos stay without a caption and AI name, to show the fallback titles.
    const uncaptioned = c.kind === "photo" && i % 2 === 0;
    if (uncaptioned) c.text = "";
    if (!c.autoJunk && !c.sensitive && !uncaptioned)
      c.ai = {
        title: D.card(i, c.kind),
        summary: D.summary,
        topic: topics[i % 5],
        // A few cards carry a near-copy of a tag ("reference" next to "references"), for "Tidy up" to find.
        tags: i % 10 === 3 ? [D.tags[0], D.tags[2].slice(0, -1)] : D.tags.slice(0, (i % 3) + 1),
        action: (["read_later", "idea", "reference", "todo"] as const)[i % 4],
        priority: i % 6 === 0 ? 1 : 2,
        model: "demo",
        at: "",
      };
    // Spread over the last two months, so "Recent" has something but not everything.
    c.date = new Date(Date.now() - 60 * 864e5 + i * 864e5 + (i % 5) * 3_600_000).toISOString();
    return c;
  });
  // A one-line note, like most real Saved Messages: the AI title and summary say more than the message.
  const short = structuredClone(base.find((c) => c.kind === "text" && !c.urls.length) ?? base[0]);
  Object.assign(short, { id: 61, text: D.short.text, urls: [], link: undefined, media: undefined, forwardedFrom: undefined, sensitive: false, autoJunk: false, date: new Date(Date.now() - 3_600_000).toISOString() });
  short.ai = { title: D.short.title, summary: D.short.summary, topic: D.short.topic, tags: D.short.tags, action: "todo", priority: 2, model: "claude-haiku-5-5", at: "" };
  cards.push(short);
  cards.reverse(); // the library is kept newest first
  annotateContext(cards);
  // The first topic comes already split into AI subgroups, to show how that looks.
  const first = cards.filter((c) => c.ai?.topic === topics[0]).map((c) => c.id);
  const half = Math.ceil(first.length / 2);
  const subgroups = { [topics[0]]: { at: "", groups: D.groups.map((name, i) => ({ name, ids: first.slice(i * half, (i + 1) * half) })) } };
  return { version: 1, chatName: D.chatName, sourceDir: "demo", importedAt: new Date().toISOString(), cards, subgroups };
}
