import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { parseExport } from "./parser";
import { mergeImport } from "./library";
import type { Library } from "./types";

export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${rel.replace(/[\\/]+/g, sep)}`;
}

export function mediaUrl(lib: Library, rel: string | undefined): string | undefined {
  if (!rel) return undefined;
  return convertFileSrc(joinPath(lib.sourceDir, rel));
}

/** Asks for the export folder (the one that contains result.json) and returns null if cancelled. */
export async function pickExportFolder(): Promise<string | null> {
  const dir = await open({ directory: true, title: "Папка экспорта Telegram (с файлом result.json)" });
  return typeof dir === "string" ? dir : null;
}

export async function importFolder(dir: string, prev: Library | null): Promise<{ lib: Library; added: number; warning?: string }> {
  let raw: string;
  try {
    raw = await readTextFile(joinPath(dir, "result.json"));
  } catch {
    throw new Error("В этой папке нет result.json. Выбери папку, которую создал экспорт Telegram Desktop (формат JSON).");
  }
  const parsed = parseExport(JSON.parse(raw));
  const known = new Set(prev?.cards.map((c) => c.id));
  const added = parsed.cards.filter((c) => !known.has(c.id)).length;
  const lib = mergeImport(prev, {
    chatName: parsed.chatName,
    sourceDir: dir,
    importedAt: new Date().toISOString(),
    cards: parsed.cards,
  });
  const warning =
    parsed.chatType !== "saved_messages"
      ? `Это экспорт чата «${parsed.chatName}», а не «Избранного». Импортировал как есть.`
      : undefined;
  return { lib, added, warning };
}
