import { T } from "../i18n";
import { platform } from "@platform";
import type { ExportSource } from "../platform/types";
import { parseExport } from "./parser";
import { mergeImport } from "./library";
import type { Library } from "./types";

export { joinPath } from "../platform/types";

export function mediaUrl(lib: Library, rel: string | undefined): string | undefined {
  if (!rel) return undefined;
  return platform.mediaUrl(lib.sourceDir, rel);
}

/** Asks for the export folder (the one that contains result.json) and returns null if cancelled. */
export const pickExportFolder = (): Promise<ExportSource | null> => platform.pickExport();

export async function importFolder(src: ExportSource, prev: Library | null): Promise<{ lib: Library; added: number; warning?: string }> {
  let raw: string;
  try {
    raw = await src.readText("result.json");
  } catch {
    throw new Error(T.importer.noResultJson);
  }
  const parsed = parseExport(JSON.parse(raw));
  const known = new Set(prev?.cards.map((c) => c.id));
  const added = parsed.cards.filter((c) => !known.has(c.id)).length;
  const lib = mergeImport(prev, {
    chatName: parsed.chatName,
    sourceDir: src.dir,
    importedAt: new Date().toISOString(),
    cards: parsed.cards,
  });
  const warning =
    parsed.chatType !== "saved_messages"
      ? T.importer.notSaved(parsed.chatName)
      : undefined;
  return { lib, added, warning };
}
