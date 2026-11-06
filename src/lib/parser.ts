import type { Card, CardKind, MediaRef } from "./types";
import { isAutoJunk, isSensitive } from "./rules";

/** Loose shape of one message in Telegram Desktop's result.json. The format is undocumented, so every field is optional. */
interface RawEntity {
  type?: string;
  text?: string;
  href?: string;
}
type RawText = string | Array<string | RawEntity>;

export interface RawMessage {
  id?: number;
  type?: string;
  date?: string;
  date_unixtime?: string;
  from?: string;
  forwarded_from?: string;
  saved_from?: string;
  text?: RawText;
  text_entities?: RawEntity[];
  photo?: string;
  width?: number;
  height?: number;
  file?: string;
  file_name?: string;
  file_size?: number;
  thumbnail?: string;
  media_type?: string;
  mime_type?: string;
  duration_seconds?: number;
  sticker_emoji?: string;
  poll?: { question?: string; answers?: Array<{ text?: string }> };
  location_information?: { latitude?: number; longitude?: number };
  contact_information?: { first_name?: string; last_name?: string; phone_number?: string };
}

interface RawChat {
  name?: string;
  type?: string;
  id?: number;
  messages?: RawMessage[];
}

export interface ParseResult {
  chatName: string;
  chatType: string;
  cards: Card[];
  skipped: number;
}

const NOT_INCLUDED = /^\(File not included/i;
const URL_IN_TEXT = /https?:\/\/[^\s<>"'«»]+/gi;

export class ExportFormatError extends Error {}

/** Finds the Saved Messages chat in either a single-chat export or a full account export. */
export function findChat(json: unknown): RawChat {
  if (!json || typeof json !== "object") throw new ExportFormatError("Файл не похож на экспорт Telegram (ожидался JSON-объект).");
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.messages)) return obj as RawChat;
  const list = (obj.chats as { list?: RawChat[] } | undefined)?.list;
  if (Array.isArray(list)) {
    const saved = list.find((c) => c.type === "saved_messages");
    if (saved) return saved;
    throw new ExportFormatError("В полном экспорте не нашлось чата «Избранное». Отметь его при экспорте.");
  }
  throw new ExportFormatError("В файле нет списка сообщений. Нужен result.json из экспорта Telegram Desktop в формате JSON.");
}

function entitiesOf(msg: RawMessage): RawEntity[] {
  if (Array.isArray(msg.text_entities)) return msg.text_entities;
  if (typeof msg.text === "string") return [{ type: "plain", text: msg.text }];
  if (Array.isArray(msg.text)) return msg.text.map((p) => (typeof p === "string" ? { type: "plain", text: p } : p));
  return [];
}

function cleanUrl(url: string): string {
  return url.replace(/[).,;:!?]+$/, "");
}

export function extractText(msg: RawMessage): { text: string; urls: string[]; hashtags: string[] } {
  const ents = entitiesOf(msg);
  const text = ents.map((e) => e.text ?? "").join("");
  const urls = new Set<string>();
  const hashtags = new Set<string>();
  for (const e of ents) {
    if (e.type === "text_link" && e.href) urls.add(e.href);
    else if (e.type === "link" && e.text) urls.add(cleanUrl(e.text.startsWith("http") ? e.text : `https://${e.text}`));
    else if (e.type === "hashtag" && e.text) hashtags.add(e.text.replace(/^#/, "").toLowerCase());
  }
  // Fallback for exports without entity info.
  if (urls.size === 0) for (const m of text.match(URL_IN_TEXT) ?? []) urls.add(cleanUrl(m));
  if (hashtags.size === 0) for (const m of text.match(/#[\p{L}\d_]{2,}/gu) ?? []) hashtags.add(m.slice(1).toLowerCase());
  return { text, urls: [...urls], hashtags: [...hashtags] };
}

function mediaPath(p: string | undefined): Pick<MediaRef, "path" | "missing"> {
  if (!p) return {};
  if (NOT_INCLUDED.test(p)) return { missing: true };
  return { path: p };
}

const MEDIA_KINDS: Record<string, CardKind> = {
  video_file: "video",
  animation: "animation",
  voice_message: "voice",
  video_message: "video_note",
  audio_file: "audio",
  sticker: "sticker",
};

function kindAndMedia(msg: RawMessage, urls: string[]): { kind: CardKind; media?: MediaRef } {
  if (msg.photo !== undefined) {
    return { kind: "photo", media: { ...mediaPath(msg.photo), width: msg.width, height: msg.height } };
  }
  if (msg.file !== undefined || msg.media_type) {
    const kind = (msg.media_type && MEDIA_KINDS[msg.media_type]) || "document";
    const thumb = msg.thumbnail && !NOT_INCLUDED.test(msg.thumbnail) ? msg.thumbnail : undefined;
    return {
      kind,
      media: {
        ...mediaPath(msg.file),
        thumb,
        width: msg.width,
        height: msg.height,
        mime: msg.mime_type,
        size: msg.file_size,
        duration: msg.duration_seconds,
        fileName: msg.file_name,
      },
    };
  }
  if (msg.poll) return { kind: "poll" };
  if (msg.location_information) return { kind: "location" };
  if (msg.contact_information) return { kind: "contact" };
  return { kind: urls.length > 0 ? "link" : "text" };
}

function extraText(msg: RawMessage): string {
  if (msg.poll) {
    const answers = (msg.poll.answers ?? []).map((a) => `• ${a.text ?? ""}`).join("\n");
    return `${msg.poll.question ?? ""}\n${answers}`.trim();
  }
  if (msg.contact_information) {
    const c = msg.contact_information;
    return [c.first_name, c.last_name, c.phone_number].filter(Boolean).join(" ");
  }
  if (msg.location_information) {
    const l = msg.location_information;
    return `${l.latitude}, ${l.longitude}`;
  }
  if (msg.media_type === "sticker" && msg.sticker_emoji) return msg.sticker_emoji;
  return "";
}

function toIsoDate(msg: RawMessage): string {
  if (msg.date_unixtime) return new Date(Number(msg.date_unixtime) * 1000).toISOString();
  if (msg.date) return new Date(msg.date).toISOString();
  return new Date(0).toISOString();
}

export function messageToCard(msg: RawMessage): Card | null {
  if (msg.type && msg.type !== "message") return null;
  if (typeof msg.id !== "number") return null;
  const { text: bodyText, urls, hashtags } = extractText(msg);
  const text = bodyText || extraText(msg);
  const { kind, media } = kindAndMedia(msg, urls);
  const card: Card = {
    id: msg.id,
    date: toIsoDate(msg),
    kind,
    text,
    urls,
    hashtags,
    media,
    forwardedFrom: msg.forwarded_from ?? msg.saved_from ?? undefined,
  };
  if (isSensitive(text)) card.sensitive = true;
  if (isAutoJunk(card)) card.autoJunk = true;
  return card;
}

/**
 * Telegram exports an album as consecutive messages sent in the same second, where
 * usually only the first carries a caption. Merge them into one card.
 */
export function groupAlbums(cards: Card[]): Card[] {
  const out: Card[] = [];
  for (const card of cards) {
    const prev = out[out.length - 1];
    const visual = (c: Card) => c.kind === "photo" || c.kind === "video";
    if (
      prev &&
      visual(prev) &&
      visual(card) &&
      prev.date === card.date &&
      prev.forwardedFrom === card.forwardedFrom &&
      card.text.trim() === "" &&
      card.media
    ) {
      prev.album = [...(prev.album ?? []), card.media];
      prev.albumIds = [...(prev.albumIds ?? []), card.id];
      continue;
    }
    out.push(card);
  }
  return out;
}

export function parseExport(json: unknown): ParseResult {
  const chat = findChat(json);
  const messages = chat.messages ?? [];
  const cards: Card[] = [];
  let skipped = 0;
  for (const msg of messages) {
    const card = messageToCard(msg);
    if (card) cards.push(card);
    else skipped++;
  }
  return {
    chatName: chat.name ?? "Избранное",
    chatType: chat.type ?? "unknown",
    cards: groupAlbums(cards),
    skipped,
  };
}
