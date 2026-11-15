import type { Card, LinkHealth, LinkMeta } from "./types";
import { matchesFilter } from "./library";

/**
 * "Check links": whether each saved link still opens. Only a page the site itself says is gone
 * (404, 410) counts as broken. A failed name lookup, a block, a rate limit, a server error or a
 * timeout can't tell (a flaky network looks the same as a dead site), so those cards are never
 * offered for the junk.
 */
export function healthOf(r: { status?: number; error?: string }): LinkHealth {
  if (r.status === undefined) return "unknown";
  if (r.status >= 200 && r.status < 400) return "ok";
  return r.status === 404 || r.status === 410 ? "broken" : "unknown";
}

/** What a refreshed preview keeps of the last check: nothing once the page opened again. */
export function keepHealth(old: Pick<LinkMeta, "health" | "checkedAt"> | undefined, fresh: LinkMeta): Pick<LinkMeta, "health" | "checkedAt"> {
  return old?.health && fresh.error ? { health: old.health, checkedAt: old.checkedAt } : {};
}

/** Live link cards (junk aside): how many there are, how many were checked, and the result. */
export function linkCounts(cards: Card[]) {
  const out = { links: 0, checked: 0, ok: 0, broken: [] as number[], unknown: 0 };
  for (const c of cards) {
    if (c.removed || c.kind !== "link" || !c.urls[0] || !matchesFilter(c, "all")) continue;
    out.links++;
    const h = c.link?.health;
    if (!h) continue;
    out.checked++;
    if (h === "ok") out.ok++;
    else if (h === "broken") out.broken.push(c.id);
    else out.unknown++;
  }
  return out;
}
