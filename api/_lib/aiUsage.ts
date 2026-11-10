// What the built-in key really costs: tokens and dollars per day, model and kind of request, and
// per install per month (to see what one user costs). Only numbers are kept: never message text,
// never the IP address, and the install id only as a short one-way hash.
// Read back through api/stats.ts (KIPPLE_STATS_TOKEN).

import { createHash } from "node:crypto";
import { groupsSystemPrompt, imageSystemPrompt, synonymsSystemPrompt, systemPrompt, type AiLang } from "../../src/lib/prompts.js";
import { unitsOf, type Usage } from "./quota.js";
import { STATS_TTL } from "./stats.js";

const SHORT: Record<string, string> = { "claude-haiku-5-5": "haiku", "claude-sonnet-5-5": "sonnet", "claude-opus-5-5": "opus" };

export type Kind = "tag" | "image" | "synonyms" | "groups" | "other";

let kinds: Map<string, Kind> | null = null;
/** Which of the app's requests this is, from its system prompt. */
export function requestKind(system: unknown): Kind {
  if (!kinds) {
    const langs: AiLang[] = ["source", "ru", "en"];
    kinds = new Map<string, Kind>();
    for (const l of langs) {
      kinds.set(systemPrompt(l), "tag");
      kinds.set(groupsSystemPrompt(l), "groups");
      for (const u of ["ru", "en"] as const) kinds.set(imageSystemPrompt(l, u), "image");
    }
    for (const k of ["topics", "tags"] as const) kinds.set(synonymsSystemPrompt(k), "synonyms");
  }
  return (typeof system === "string" && kinds.get(system)) || "other";
}

/** How many saved messages the request covers: JSON lines for tagging and grouping, pictures for naming. */
export function itemCount(kind: Kind, body: Record<string, unknown>): number {
  const content = (body.messages as { content?: unknown }[] | undefined)?.[0]?.content;
  if ((kind === "tag" || kind === "groups") && typeof content === "string") {
    const at = content.indexOf("one JSON line each:\n");
    return at < 0 ? 0 : content.slice(at).split("\n").slice(1).filter((l) => l.trim()).length;
  }
  if (kind === "image" && Array.isArray(content)) return content.filter((b) => (b as { type?: string })?.type === "image").length;
  return 0;
}

/** What the request cost, in millionths of a dollar: the same figure the quotas count (quota.ts unitsOf). */
export const costMicro = unitsOf;

export const installHash = (install: string) => createHash("sha256").update(`kipple-usage:${install}`).digest("hex").slice(0, 16);

type Cmd = (string | number)[];

/**
 * Redis commands adding one answered request to the totals. Day totals: hash ku:d:<date>, fields
 * "<model>|<kind>|<what>" (req, err, items, in, out, cache_w, cache_r, usd_micro). Month per install:
 * hash ku:m:<YYYY-MM>, fields "<install hash>" (usd_micro) and "<install hash>|items".
 */
export function usageCommands(a: { model: string; kind: Kind; items: number; usage?: Usage; ok: boolean; install: string; now?: Date }): Cmd[] {
  const now = a.now ?? new Date();
  const day = `ku:d:${now.toISOString().slice(0, 10)}`;
  const month = `ku:m:${now.toISOString().slice(0, 7)}`;
  const f = (what: string) => `${SHORT[a.model] ?? a.model}|${a.kind}|${what}`;
  if (!a.ok) return [["HINCRBY", day, f("err"), 1], ["EXPIRE", day, STATS_TTL]];
  // Answered but without token counts (shouldn't happen): the quota kept the reservation, so count it apart.
  if (!a.usage) return [["HINCRBY", day, f("nousage"), 1], ["EXPIRE", day, STATS_TTL]];
  const u = a.usage;
  const usd = costMicro(a.model, u);
  const h = installHash(a.install);
  const cmds: Cmd[] = [
    ["HINCRBY", day, f("req"), 1],
    ["HINCRBY", day, f("items"), a.items],
    ["HINCRBY", day, f("in"), u.input_tokens ?? 0],
    ["HINCRBY", day, f("out"), u.output_tokens ?? 0],
    ["HINCRBY", day, f("cache_w"), u.cache_creation_input_tokens ?? 0],
    ["HINCRBY", day, f("cache_r"), u.cache_read_input_tokens ?? 0],
    ["HINCRBY", day, f("usd_micro"), usd],
    ["EXPIRE", day, STATS_TTL],
    ["HINCRBY", month, h, usd],
    ["HINCRBY", month, `${h}|items`, a.items],
    ["EXPIRE", month, STATS_TTL],
  ];
  return cmds;
}

/** One month of per-install costs turned into what matters: how many users, and what one costs. */
export function summarizeMonth(h: Record<string, number>): Record<string, number> {
  const cost: number[] = [];
  let items = 0;
  for (const [k, v] of Object.entries(h)) {
    if (k.endsWith("|items")) items += v;
    else cost.push(v);
  }
  cost.sort((x, y) => x - y);
  const usd = (micro: number) => Math.round(micro) / 1e6;
  const at = (q: number) => (cost.length ? cost[Math.min(cost.length - 1, Math.floor(q * cost.length))] : 0);
  const total = cost.reduce((s, v) => s + v, 0);
  return {
    installs: cost.length,
    items,
    usd_total: usd(total),
    usd_per_install_avg: cost.length ? usd(total / cost.length) : 0,
    usd_per_install_median: usd(at(0.5)),
    usd_per_install_p90: usd(at(0.9)),
    usd_per_install_max: usd(at(1)),
    usd_per_1000_items: items ? usd((total / items) * 1000) : 0,
  };
}
