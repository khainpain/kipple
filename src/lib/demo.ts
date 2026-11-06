// Sample library for the browser build's «Демо» button: lets you see the grid without an export.
import fixture from "../../fixtures/saved_messages.json";
import { parseExport } from "./parser";
import type { Library } from "./types";

const swatch = (hue: number, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${hue},55%,70%)'/></svg>`)}`;

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
    if (!c.autoJunk && !c.sensitive)
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
    return c;
  });
  return { version: 1, chatName: "Избранное (демо)", sourceDir: "demo", importedAt: new Date().toISOString(), cards };
}
