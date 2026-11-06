// Dev-only: renders the library UI in a normal browser with sample data, without Tauri.
// Open http://localhost:1420/preview.html while `npm run dev` is running.
import ReactDOM from "react-dom/client";
import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import "../App.css";
import fixture from "../../fixtures/saved_messages.json";
import { parseExport } from "../lib/parser";
import { Grid } from "../components/Grid";
import type { Library } from "../lib/types";

mockConvertFileSrc("windows");

const swatch = (hue: number, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${hue},55%,70%)'/></svg>`)}`;

const base = parseExport(fixture).cards;
const topics = ["Дизайн", "Программирование", "Еда", "Путешествия", "Финансы"];
const cards = Array.from({ length: 60 }, (_, i) => {
  const c = structuredClone(base[i % base.length]);
  c.id = i + 1;
  if (c.kind === "link") c.link = { url: c.urls[0], title: `Статья номер ${i}`, siteName: "example.com", image: i % 3 ? swatch(i * 37, 1200, 630) : undefined, fetchedAt: "" };
  if (c.kind === "photo") c.link = undefined;
  if (!c.autoJunk && !c.sensitive)
    c.ai = { title: `Карточка ${i}: ${c.kind}`, summary: "Короткое описание того, что здесь сохранено и зачем к этому вернуться.", topic: topics[i % 5], tags: ["css", "идеи", "референсы"].slice(0, (i % 3) + 1), action: (["read_later", "idea", "reference", "todo"] as const)[i % 4], priority: 2, model: "preview", at: "" };
  return c;
});
const lib: Library = { version: 1, chatName: "Избранное", sourceDir: "C:\\export", importedAt: "", cards };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div className="app">
    <div className="main">
      <Grid lib={lib} cards={cards.filter((c) => !c.autoJunk)} selected={new Set([3])} onOpen={() => {}} onToggleSelect={() => {}} onJunk={() => {}} />
    </div>
  </div>,
);
