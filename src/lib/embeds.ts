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

/** Vimeo video id from vimeo.com/123 or player.vimeo.com/video/123. */
export function vimeoId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/(^|\.)vimeo\.com$/.test(u.hostname)) return undefined;
    return u.pathname.match(/^\/(?:video\/)?(\d{5,})/)?.[1];
  } catch {
    return undefined;
  }
}

/** TikTok video id from tiktok.com/@user/video/123 (short vm.tiktok.com links don't carry it). */
export function tiktokId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/(^|\.)tiktok\.com$/.test(u.hostname)) return undefined;
    return u.pathname.match(/\/video\/(\d{8,})/)?.[1];
  } catch {
    return undefined;
  }
}

export type EmbedProvider = "youtube" | "instagram" | "vimeo" | "tiktok";

export interface Embed {
  provider: EmbedProvider;
  /** Player page to load in a frame. */
  src: string;
  /** Width / height of the player before it reports its own size. */
  ratio: number;
  /** The provider's page tells the app its real height (Instagram does). */
  measures?: boolean;
  /** Known to be a video; an Instagram /p/ post may be just photos. */
  video: boolean;
}

/** A player the card can show in place of the link's picture, for video sites that allow embedding. */
export function embedOf(url: string | undefined): Embed | undefined {
  if (!url) return undefined;
  const yt = youtubeId(url);
  if (yt) {
    const vertical = /\/shorts\//.test(url);
    return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1`, ratio: vertical ? 9 / 16 : 16 / 9, video: true };
  }
  const ig = instagramCode(url);
  if (ig) {
    const video = /\/(?:reels?|tv)\//.test(new URL(url).pathname);
    return { provider: "instagram", src: `https://www.instagram.com/p/${ig}/embed/`, ratio: video ? 9 / 16 : 4 / 5, measures: true, video };
  }
  const vm = vimeoId(url);
  if (vm) return { provider: "vimeo", src: `https://player.vimeo.com/video/${vm}?autoplay=1&dnt=1`, ratio: 16 / 9, video: true };
  const tt = tiktokId(url);
  if (tt) return { provider: "tiktok", src: `https://www.tiktok.com/player/v1/${tt}?autoplay=1&rel=0`, ratio: 9 / 16, video: true };
  return undefined;
}

/** Links that are a video (or a post that may be one): the card gets a play mark and an in-card player. */
export function isVideoLink(url: string | undefined): boolean {
  return !!embedOf(url)?.video;
}

/**
 * Instagram stuffs the author and the whole caption into the page title
 * ("Name on Instagram: “caption…”") and adds likes to the description
 * ("1,234 likes, 5 comments - user on May 1, 2024: “caption”."). Pulls the two apart.
 */
export function splitInstagram(title: string | undefined, description: string | undefined): { author?: string; caption?: string } {
  const unquote = (s: string) => s.trim().replace(/^["“«]/, "").replace(/["”»]\s*\.?\s*$/, "").trim();
  const t = title?.match(/^(.+?) on Instagram:\s*([\s\S]*)$/i);
  const d = description?.match(/^[^-]*?\b(?:likes?|comments?)\b[^-]*-\s*([\w.]+) on [^:]+:\s*([\s\S]*)$/i);
  const author = t?.[1]?.trim() || d?.[1];
  const caption = (d && unquote(d[2])) || (t && unquote(t[2])) || undefined;
  if (author || caption) return { author, caption };
  // Already clean (the embed-page fallback stores "author в Instagram" + caption), or nothing usable.
  return { caption: description?.trim() || undefined };
}

/** First line of a caption, cut at a word, to use as a heading. */
export function headline(text: string, max = 90): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/** Title, description and author to show for a link preview; Instagram's run-on title is split up. */
export function linkText(link: { url: string; title?: string; description?: string } | undefined): { title?: string; description?: string; author?: string } {
  if (!link) return {};
  // The app stores the channel name as a YouTube video's description (that's all oEmbed gives).
  if (youtubeId(link.url)) return { title: link.title, author: link.description };
  if (!instagramCode(link.url)) return { title: link.title, description: link.description };
  const { author, caption } = splitInstagram(link.title, link.description);
  if (caption) {
    const title = headline(caption);
    // When the heading is the caption's whole first line, the description goes on from the next one.
    const [first, ...rest] = caption.trim().split("\n");
    const description = first.trim() === title ? rest.join("\n").trim() : caption;
    return { title, description: description || undefined, author };
  }
  return { title: author ? `${author} · Instagram` : link.title, author };
}
