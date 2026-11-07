// Vercel function behind the landing page's download button (/download): sends the visitor
// straight to the Windows installer of the latest GitHub release. The installer's file name
// carries the version (Install-Kipple-0.1.15.exe), so there's no fixed "latest" link to it.
// The answer is cached at the edge for 10 minutes, so GitHub's API is asked rarely; if it
// can't be reached, the visitor lands on the releases page instead.
const REPO = "khainpain/kipple";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string };

/** The wrapper installer first, the plain NSIS setup as a fallback. */
export function pickInstaller(assets: Asset[]): string | null {
  const wrapper = assets.find((a) => /^Install-Kipple-[\d.]+\.exe$/i.test(a.name));
  const nsis = assets.find((a) => /_x64-setup\.exe$/i.test(a.name));
  return (wrapper ?? nsis)?.browser_download_url ?? null;
}

export async function GET(): Promise<Response> {
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
  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      "cache-control": target === RELEASES ? "no-store" : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
