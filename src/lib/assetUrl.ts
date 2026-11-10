/**
 * Link previews store the picture and icon a page names, and the app shows them straight from
 * there. A page could name an address in the user's own network (a router's reboot URL, a local
 * server), which every render of the card would then request. Such addresses are dropped here.
 * Names are not resolved (there's no time for that while rendering), so only addresses and names
 * that are local by their form are caught: IP literals, single-label names, .local/.lan and kin.
 */
const LOCAL_NAME = /(^localhost$|\.localhost$|\.local$|\.lan$|\.home$|\.home\.arpa$|\.internal$|\.intranet$|\.corp$|^fritz\.box$|\.localdomain$)/i;

function privateV4(a: number, b: number): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h.startsWith("[")) {
    const v6 = h.slice(1, -1);
    if (v6 === "::" || v6 === "::1") return true;
    const mapped = /^::ffff:(?:(\d+)\.(\d+)\.\d+\.\d+|([0-9a-f]{1,4}):[0-9a-f]{1,4})$/.exec(v6);
    if (mapped) return mapped[1] ? privateV4(+mapped[1], +mapped[2]) : privateV4(parseInt(mapped[3], 16) >> 8, parseInt(mapped[3], 16) & 255);
    return /^(f[cd]|fe[89ab]|fe[c-f]|ff)/.test(v6);
  }
  // The URL parser already turned 2130706433, 0x7f.1 and the like into dotted form.
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (v4) return privateV4(+v4[1], +v4[2]);
  return !h.includes(".") || LOCAL_NAME.test(h);
}

/** `url` if it's safe to show as a picture: data:/blob:, or http(s) to a host that isn't local by its form. */
export function publicAssetUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(data:image\/|blob:)/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}
