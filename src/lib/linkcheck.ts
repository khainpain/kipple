import type { Card, LinkHealth } from "./types";
import { matchesFilter } from "./library";

/**
 * "Check links": whether each saved link still opens. Only a page that is gone (404, 410) or a
 * site whose name no longer resolves counts as broken; blocks, rate limits, server errors and
 * timeouts can't tell, so those cards are never offered for the junk.
 */
export function healthOf(r: { status?: number; error?: string }): LinkHealth {
  if (r.status !== undefined) {
    if (r.status >= 200 && r.status < 400) return "ok";
    return r.status === 404 || r.status === 410 ? "broken" : "unknown";
  }
  return /dns error|failed to lookup address|name_not_resolved|name or service not known|no such host|getaddrinfo|enotfound/i.test(r.error ?? "") ? "broken" : "unknown";
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
