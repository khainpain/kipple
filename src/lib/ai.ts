import Anthropic from "@anthropic-ai/sdk";
import { platform } from "@platform";
import { z } from "zod";
import type { AiFields, Card } from "./types";
import { domainOf } from "./rules";
import { ItemSchema, imageSystemPrompt, outputFormat, systemPrompt, type AiLang } from "./prompts";
import { T, lang as uiLang } from "../i18n";

export type { AiLang } from "./prompts";

/** Models the user can pick in Settings. Haiku is the default: cheapest and good enough for tagging. */
export const AI_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = "claude-haiku-5-5";
/** Rough cost of tagging 10,000 messages, in dollars: [low, high]. */
export const COST_PER_10K: Record<AiModel, [number, number]> = {
  "claude-haiku-5-5": [1, 2],
  "claude-sonnet-5-5": [20, 40],
  "claude-opus-5-5": [40, 80],
};
/** A rough "$a–b" for tagging n messages with the model. */
export function costEstimate(n: number, model: AiModel): string {
  const fmt = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : String(Math.round(x)));
  const [lo, hi] = COST_PER_10K[model];
  return `$${fmt((n * lo) / 10000)}–${fmt((n * hi) / 10000)}`;
}

/** A model id from settings, or the default if it is unknown (e.g. retired later). */
export const aiModelOf = (m: string | undefined): AiModel => ((AI_MODELS as readonly string[]).includes(m ?? "") ? (m as AiModel) : DEFAULT_AI_MODEL);
const BATCH = 40;
const PARALLEL = 3;


/** An error that stops the whole run (bad key, allowance used up); its message is for the user. */
export class AiStop extends Error {}

/**
 * Whose key pays. By default the built-in one: requests go to our Vercel function
 * (api/claude), which adds the key and counts a daily allowance per install, so message
 * text passes through our server on its way to Anthropic. A key the user saved in Settings
 * goes straight to Anthropic from this computer instead.
 */
export type AiAuth = { kind: "own"; key: string } | { kind: "builtin"; install: string };

/** Where the built-in key lives: this same site in the browser build, the production site on desktop. */
export const PROXY_BASE: string =
  import.meta.env.VITE_AI_PROXY || (platform.kind === "web" ? `${location.origin}/api/claude` : "https://telegram-saved-messages.vercel.app/api/claude");

// Desktop requests go out through Tauri's HTTP client (no CORS); the browser uses its own fetch.
const sdkFetch = (platform.kind === "web" ? globalThis.fetch.bind(globalThis) : platform.httpFetch) as unknown as typeof globalThis.fetch;

export function makeClient(auth: AiAuth) {
  if (auth.kind === "own")
    return new Anthropic({
      apiKey: auth.key,
      dangerouslyAllowBrowser: true, // the key stays on this computer
      fetch: sdkFetch,
      maxRetries: 3,
    });
  return new Anthropic({
    apiKey: "built-in", // the server puts the real key in; this one is dropped there
    baseURL: PROXY_BASE,
    defaultHeaders: { "x-kipple-install": auth.install },
    dangerouslyAllowBrowser: true,
    fetch: sdkFetch,
    maxRetries: 3,
  });
}

/** Turns the errors that should stop the run into AiStop; returns the rest as they are. */
function stopping(e: unknown, auth: AiAuth): unknown {
  if (!(e instanceof Anthropic.APIError)) return e;
  const type = (e.error as { error?: { type?: string } } | undefined)?.error?.type;
  if (type === "kipple_quota") return new AiStop(T.ai.quotaUsed);
  if (type === "kipple_quota_global") return new AiStop(T.ai.quotaGlobal);
  if (type === "kipple_unavailable") return new AiStop(T.ai.builtinDown);
  if (e instanceof Anthropic.AuthenticationError && auth.kind === "own") return new AiStop(T.ai.keyRejected);
  return e;
}

/** Today's use of the built-in allowance, 0..1, or null when it can't be told. */
export async function builtinUsage(install: string): Promise<number | null> {
  try {
    const res = await sdkFetch(`${PROXY_BASE}/usage`, { headers: { "x-kipple-install": install } });
    if (!res.ok) return null;
    const u = (await res.json()) as { used: number; limit: number };
    return u.limit > 0 ? Math.min(1, u.used / u.limit) : null;
  } catch {
    return null;
  }
}

function describeCard(c: Card): Record<string, unknown> {
  const out: Record<string, unknown> = { id: c.id, kind: c.kind, date: c.date.slice(0, 10) };
  if (c.text) out.text = c.text.slice(0, 1500);
  if (c.forwardedFrom) out.from = c.forwardedFrom;
  if (c.urls.length) out.urls = c.urls.slice(0, 3).map((u) => `${domainOf(u)} ${u}`.slice(0, 200));
  if (c.link && !c.link.error) {
    out.page = {
      title: c.link.title,
      description: c.link.description?.slice(0, 400),
      excerpt: c.link.excerpt?.slice(0, 800),
    };
  }
  if (c.media?.fileName) out.file = c.media.fileName;
  if (c.album) out.albumSize = c.album.length + 1;
  return out;
}

/** Cards a full re-tag would send again: the ones the AI already tagged. */
export function retagCount(cards: Card[]): number {
  return cards.filter((c) => c.ai).length;
}

/** Cards that still need AI fields. Sensitive ones are never sent. */
export function pendingForAi(cards: Card[]): Card[] {
  return cards.filter((c) => !c.ai && !c.sensitive && !c.removed && !c.autoJunk && (c.text.trim() || c.link || c.media?.fileName));
}

/**
 * Topics and tags already in use, so the AI reuses them. In a fixed language only cards tagged
 * in that language count (cards tagged before the language was recorded were mostly Russian),
 * so switching to English doesn't keep pulling in Russian topics.
 */
export function vocabulary(cards: Card[], lang: AiLang = "source"): { topics: string[]; tags: string[] } {
  const topics = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const c of cards) {
    if (lang !== "source" && (c.ai?.lang ?? "ru") !== lang) continue;
    if (c.ai?.topic) topics.set(c.ai.topic, (topics.get(c.ai.topic) ?? 0) + 1);
    for (const t of c.ai?.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return { topics: top(topics, 40), tags: top(tags, 80) };
}

async function classifyBatch(client: Anthropic, model: AiModel, batch: Card[], vocab: { topics: string[]; tags: string[] }, lang: AiLang) {
  const input = batch.map((c) => JSON.stringify(describeCard(c))).join("\n");
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: systemPrompt(lang),
    output_config: { effort: "low", format: outputFormat() },
    messages: [
      {
        role: "user",
        content: `${vocabText(vocab)}\n\nItems, one JSON line each:\n${input}`,
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error(T.ai.refused);
  return res.parsed_output?.items ?? [];
}

const vocabText = (v: { topics: string[]; tags: string[] }) => `Topic vocabulary: ${v.topics.join(", ") || "(empty so far)"}\nTag vocabulary: ${v.tags.join(", ") || "(empty so far)"}`;

function toFields(it: z.infer<typeof ItemSchema>, at: string, lang: AiLang, model: AiModel): AiFields {
  return {
    title: it.title.slice(0, 120),
    summary: it.summary.slice(0, 400),
    topic: it.topic.slice(0, 40),
    tags: it.tags.map((t) => t.toLowerCase().slice(0, 30)).slice(0, 6),
    action: it.action,
    priority: Math.min(3, Math.max(1, it.priority)) as 1 | 2 | 3,
    model,
    at,
    lang,
  };
}

export interface AiProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Classifies cards in batches, mutating them in place and calling onBatch after
 * each batch so the UI can re-render and persist. Stops early when signal aborts.
 */
export async function classifyCards(
  auth: AiAuth,
  all: Card[],
  lang: AiLang,
  model: AiModel,
  onBatch: (p: AiProgress) => void,
  signal?: AbortSignal,
): Promise<AiProgress> {
  const client = makeClient(auth);
  const todo = pendingForAi(all);
  const batches: Card[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const progress: AiProgress = { done: 0, total: todo.length, failed: 0 };
  let next = 0;
  let stop: AiStop | null = null;

  async function worker() {
    while (next < batches.length && !signal?.aborted && !stop) {
      const batch = batches[next++];
      try {
        const items = await classifyBatch(client, model, batch, vocabulary(all, lang), lang);
        const byId = new Map(items.map((it) => [it.id, it]));
        const at = new Date().toISOString();
        for (const c of batch) {
          const it = byId.get(c.id);
          if (!it) {
            progress.failed++;
            continue;
          }
          c.ai = toFields(it, at, lang, model);
          progress.done++;
        }
      } catch (e) {
        const err = stopping(e, auth);
        if (err instanceof AiStop) {
          stop = err;
          throw err;
        }
        console.error("AI batch failed", e);
        progress.failed += batch.length;
      }
      onBatch({ ...progress });
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  return progress;
}

// ---- Photos without a caption -------------------------------------------------
// Only when the user turned this on (or asked for one card): the picture itself goes
// to Anthropic, shrunk to IMAGE_SIDE px on the long side, which keeps it ~800 tokens.

const IMAGE_SIDE = 768;
const IMAGE_BATCH = 6;


/** Photos that have no caption and no AI name yet. Sensitive and hidden ones are never sent. */
export function pendingImages(cards: Card[]): Card[] {
  return cards.filter((c) => c.kind === "photo" && !c.ai && !c.text.trim() && !c.sensitive && !c.removed && !c.user?.hidden && !!c.media?.path && !c.media.missing);
}

/** Shrinks a picture to a JPEG for the API; the original file is never sent. */
async function toJpegBase64(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); // decodes SVG too, unlike createImageBitmap
    img.src = url;
    await img.decode();
    const k = Math.min(1, IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent PNGs would turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function nameImageBatch(client: Anthropic, model: AiModel, batch: Array<{ card: Card; data: string }>, vocab: { topics: string[]; tags: string[] }, lang: AiLang) {
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: vocabText(vocab) }];
  for (const { card, data } of batch) {
    const info: Record<string, unknown> = { id: card.id, date: card.date.slice(0, 10) };
    if (card.context) info.nearbyText = card.context;
    if (card.forwardedFrom) info.from = card.forwardedFrom;
    content.push({ type: "text", text: JSON.stringify(info) });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  const res = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: imageSystemPrompt(lang, uiLang()),
    output_config: { effort: "low", format: outputFormat() },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error(T.ai.refusedImages);
  return res.parsed_output?.items ?? [];
}

/** Names the given photos from their content, mutating cards in place like classifyCards. */
export async function nameImages(
  auth: AiAuth,
  all: Card[],
  todo: Card[],
  lang: AiLang,
  model: AiModel,
  read: (c: Card) => Promise<Blob>,
  onBatch: (p: AiProgress) => void,
  signal?: AbortSignal,
): Promise<AiProgress> {
  const client = makeClient(auth);
  const progress: AiProgress = { done: 0, total: todo.length, failed: 0 };
  for (let i = 0; i < todo.length && !signal?.aborted; i += IMAGE_BATCH) {
    const slice = todo.slice(i, i + IMAGE_BATCH);
    const batch: Array<{ card: Card; data: string }> = [];
    for (const card of slice) {
      try {
        batch.push({ card, data: await toJpegBase64(await read(card)) });
      } catch (e) {
        console.warn("cannot read photo", card.id, e);
        progress.failed++;
      }
    }
    if (batch.length) {
      try {
        const items = await nameImageBatch(client, model, batch, vocabulary(all, lang), lang);
        const byId = new Map(items.map((it) => [it.id, it]));
        const at = new Date().toISOString();
        for (const { card } of batch) {
          const it = byId.get(card.id);
          if (it) {
            card.ai = toFields(it, at, lang, model);
            progress.done++;
          } else progress.failed++;
        }
      } catch (e) {
        const err = stopping(e, auth);
        if (err instanceof AiStop) throw err;
        console.error("AI image batch failed", e);
        progress.failed += batch.length;
      }
    }
    onBatch({ ...progress });
  }
  return progress;
}
