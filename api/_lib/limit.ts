// Per-client rate limits for the public functions (ping, download, fetch), counted in the same
// store as the AI quota (redis() in quota.ts).
//
// The key holds no address: only 24 bits of a hash of the address (an IPv6 client by its /64), its
// window and the limit's name. About 256 IPv4 addresses share each value, and the same address
// hashes differently in the next window, so the counters can't be turned back into addresses or
// linked from day to day. Each key expires one window after its own.
import { createHash } from "node:crypto";
import { ipBucket, redis } from "./quota.js";

export function limitKey(name: string, rawIp: string, slot: number): string {
  const h = createHash("sha256").update(`${name}\u0000${slot}\u0000${ipBucket(rawIp)}`).digest("hex").slice(0, 6);
  return `kr:${name}:${slot}:${h}`;
}

/**
 * Counts one hit of `name` from this client in the current fixed window of `windowSec` seconds and
 * says whether it is still within `limit`. Throws when the store can't be reached; each caller
 * decides what that means for it.
 */
export async function withinLimit(name: string, rawIp: string, limit: number, windowSec: number, now = Date.now()): Promise<boolean> {
  const slot = Math.floor(now / (windowSec * 1000));
  const key = limitKey(name, rawIp, slot);
  const [n] = await redis([["INCRBY", key, 1], ["EXPIRE", key, windowSec * 2]]);
  return (n ?? 0) <= limit;
}
