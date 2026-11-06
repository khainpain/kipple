// Sample library for the browser build's «Демо» button: lets you see the grid without an export.
import fixture from "../../fixtures/saved_messages.json";
import { parseExport } from "./parser";
import { annotateContext } from "./library";
import type { Library } from "./types";

const swatch = (hue: number, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${hue},55%,70%)'/></svg>`)}`;

// A one-page PDF and a text file, so the in-card previews can be tried in the browser build.
const DEMO_PDF = "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0MjAgMjk3XSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMDQgPj4Kc3RyZWFtCkJUIC9GMSAyMiBUZiA0MCAyMjAgVGQgKERlbW8gcmVwb3J0KSBUaiAwIC0zNiBUZCAvRjEgMTIgVGYgKFRoaXMgUERGIG9wZW5zIHJpZ2h0IGluc2lkZSB0aGUgY2FyZC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzk2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDY2CiUlRU9GCg==";
const DEMO_TXT = `data:text/plain;charset=utf-8,${encodeURIComponent("Список покупок\n\n- кофе\n- хлеб\n- лампочка E27\n\nТекстовые файлы видны прямо в карточке.")}`;

export function demoLibrary(): Library {
  const base = parseExport(fixture).cards;
  const topics = ["Дизайн", "Программирование", "Еда", "Путешествия", "Финансы"];
  const cards = Array.from({ length: 60 }, (_, i) => {
    const c = structuredClone(base[i % base.length]);
    c.id = i + 1;
    if (c.kind === "link") c.link = { url: c.urls[0], title: `Статья номер ${i}`, siteName: "example.com", image: i % 3 ? swatch(i * 37, 1200, 630) : undefined, fetchedAt: "" };
    if (c.kind === "photo") {
      c.link = undefined;
      const [w, h] = i % 2 ? [800, 1000] : [1200, 800];
      c.media = { ...c.media, path: swatch(i * 53, w, h), width: w, height: h, missing: false };
      c.album = undefined;
    }
    if (c.kind === "document") {
      const txt = i % 2 === 1;
      c.media = { ...c.media, path: txt ? DEMO_TXT : DEMO_PDF, fileName: txt ? "покупки.txt" : "report.pdf", mime: txt ? "text/plain" : "application/pdf", missing: false };
    }
    // Some photos stay without a caption and AI name, to show the fallback titles.
    const uncaptioned = c.kind === "photo" && i % 2 === 0;
    if (uncaptioned) c.text = "";
    if (!c.autoJunk && !c.sensitive && !uncaptioned)
      c.ai = {
        title: `Карточка ${i}: ${c.kind}`,
        summary: "Короткое описание того, что здесь сохранено и зачем к этому вернуться.",
        topic: topics[i % 5],
        tags: ["css", "идеи", "референсы"].slice(0, (i % 3) + 1),
        action: (["read_later", "idea", "reference", "todo"] as const)[i % 4],
        priority: 2,
        model: "demo",
        at: "",
      };
    c.date = new Date(Date.parse("2026-10-01T09:00:00Z") + i * 60_000 * (i % 5 === 0 ? 30 : 1)).toISOString();
    return c;
  });
  cards.reverse(); // the library is kept newest first
  annotateContext(cards);
  return { version: 1, chatName: "Избранное (демо)", sourceDir: "demo", importedAt: new Date().toISOString(), cards };
}
