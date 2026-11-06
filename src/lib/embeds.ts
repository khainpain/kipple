// Sites whose pages don't give a usable preview on their own, handled by URL shape.

/** Video id from youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ links. */
export function youtubeId(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    if (!id) {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

/** YouTube serves a thumbnail for every video at a fixed address, no request needed. */
export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Post/reel shortcode from instagram.com/p/…, /reel/…, /tv/… links (also with a username prefix). */
export function instagramCode(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return undefined;
    return u.pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1];
  } catch {
    return undefined;
  }
}

/** A cover the card can show before (or without) fetching anything. */
export function instantImage(url: string | undefined): string | undefined {
  const id = url ? youtubeId(url) : undefined;
  return id ? youtubeThumb(id) : undefined;
}

/** Links worth fetching again when an earlier attempt left them without a picture. */
export function wantsImage(url: string): boolean {
  return !!(youtubeId(url) || instagramCode(url));
}
