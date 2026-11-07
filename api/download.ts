// Vercel function behind the landing page's download button (/download): sends the visitor
// straight to the Windows installer of the latest GitHub release. The installer's file name
// carries the version (Install-Kipple-0.1.15.exe), so there's no fixed "latest" link to it.
// GitHub's answer is kept in the function's memory for 10 minutes, so its API is asked rarely; if
// it can't be reached, the visitor lands on the releases page instead. The redirect itself is not
// cached, so every click adds one to the day's download count, by where it came from (?src=, the
// landing page passes its utm_source along). Only that count is kept: no IP, no cookie.
import { redis } from "./_lib/quota.js";
import { downloadCommands, downloadSource } from "./_lib/stats.js";

const REPO = "khainpain/kipple";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string };

/** The wrapper installer first, the plain NSIS setup as a fallback. */
export function pickInstaller(assets: Asset[]): string | null {
  const wrapper = assets.find((a) => /^Install-Kipple-[\d.]+\.exe$/i.test(a.name));
  const nsis = assets.find((a) => /_x64-setup\.exe$/i.test(a.name));
  return (wrapper ?? nsis)?.browser_download_url ?? null;
}

let cached: { url: string; until: number } | null = null;

async function latestInstaller(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.url;
  let target = RELEASES;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "kipple-landing" },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) target = pickInstaller(((await r.json()) as { assets?: Asset[] }).assets ?? []) ?? RELEASES;
  } catch {
    /* GitHub unreachable: the releases page still works */
  }
  if (target !== RELEASES) cached = { url: target, until: Date.now() + 600_000 };
  return target;
}

export async function GET(request: Request): Promise<Response> {
  const src = downloadSource(new URL(request.url).searchParams.get("src"));
  const [target] = await Promise.all([
    latestInstaller(),
    redis(downloadCommands(src)).catch((e) => console.error("download count failed", e)),
  ]);
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
}
