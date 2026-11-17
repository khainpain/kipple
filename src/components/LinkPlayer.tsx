import { useEffect, useRef, useState } from "react";
import type { Embed } from "../lib/embeds";
import { T } from "../i18n";
import { Icon } from "./Icon";
import { remoteAssetsOn } from "../lib/assetUrl";

/** Instagram's embed page reports its height as {"type":"MEASURE","details":{"height":N}}. */
function measuredHeight(data: unknown): number | undefined {
  let d = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return undefined;
    }
  }
  const m = d as { type?: string; details?: { height?: unknown } } | null;
  const h = m?.type === "MEASURE" ? Number(m.details?.height) : NaN;
  return Number.isFinite(h) && h > 100 ? Math.min(h, 4000) : undefined;
}

/**
 * The video site's own player, shown in the card in place of the link picture.
 * Nothing loads from the site until the play button is pressed: the cover is a
 * picture the app already has, so opening a card doesn't call YouTube. Instagram is
 * the exception while link previews are on (see opensDirectly).
 */
export function LinkPlayer({ embed, cover }: { embed: Embed; cover?: string }) {
  const direct = opensDirectly(embed, remoteAssetsOn());
  const [playing, setPlaying] = useState(direct);
  const [ratio, setRatio] = useState<number>();
  const [coverFailed, setCoverFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => setPlaying(direct), [embed.src, direct]);

  useEffect(() => {
    if (!playing || !embed.measures) return;
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const h = measuredHeight(e.data);
      const width = frame.current?.clientWidth ?? 0;
      if (h) setRatio((prev) => nextRatio(prev, embed, h, width));
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [playing, embed.measures, embed.src, embed.cropTop, embed.cropBottom]);

  const shown = ratio ?? embed.ratio;
  const vertical = shown < 1;
  const cls = `link-player provider-${embed.provider}${vertical ? " vertical" : ""}${embed.cropTop ? " cropped" : ""}`;

  if (!playing) {
    return (
      <button type="button" className={`${cls} facade`} style={{ aspectRatio: String(embed.ratio) }} onClick={() => setPlaying(true)} aria-label={embed.video ? T.player.play : T.player.showPost}>
        {cover && !coverFailed ? <img src={cover} alt="" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} /> : <span className="facade-blank" />}
        <span className="play-btn">
          <Icon name="play" size={26} />
        </span>
        <span className="facade-hint">{embed.video ? T.player.hint(siteName(embed.provider)) : T.player.post(siteName(embed.provider))}</span>
      </button>
    );
  }
  return (
    <div className={cls} style={{ aspectRatio: String(shown), ["--crop-top" as string]: embed.cropTop ? `${embed.cropTop}px` : undefined }}>
      <iframe
        ref={frame}
        src={embed.src}
        title={siteName(embed.provider)}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        {...frameAttrs(embed)}
      />
    </div>
  );
}

/**
 * Instagram's player can't be started from outside and shows its own cover with a play button,
 * so our cover in front of it would cost a second click. While link previews are on (the card
 * already loads pictures from the web) it is shown at once; with them off, our cover stays and
 * nothing reaches Instagram until play is pressed.
 */
export function opensDirectly(embed: Embed, previewsOn: boolean): boolean {
  return previewsOn && embed.provider === "instagram";
}

/**
 * Extra iframe attributes. A cropped player must not scroll: Instagram's embed page always
 * asks for a vertical scrollbar, and on Windows that bar narrows the page, so the video comes
 * out shorter than the box and the profile strip under it shows (and pops up on hover).
 */
export function frameAttrs(embed: Embed): { scrolling?: "no" } {
  return embed.cropTop ? { scrolling: "no" } : {};
}

/**
 * Shape of the media inside a cropped page, from the page height it reported at a given frame
 * width. Instagram's media takes each post's own shape (4:5, square, wide), so a fixed 4:5 box
 * would show the white profile strip under a square video.
 */
export function croppedRatio(embed: Embed, pageHeight: number, width: number): number | undefined {
  const media = pageHeight - (embed.cropTop ?? 0) - (embed.cropBottom ?? 0);
  const r = width / media;
  // Instagram's shapes run from 4:5 to 1.91:1; anything far outside is not a post (an error page).
  // Never taller than 4:5: the box's width is set for that shape, so taller would overflow its height cap.
  return width > 0 && media > 0 && r >= 0.5 && r <= 2 ? Math.max(r, 0.8) : undefined;
}

/**
 * The shape follows the latest height Instagram reports; an early one can be off while its page
 * loads. This can't loop: the box's width doesn't depend on the shape (see .link-player.cropped),
 * so a new shape never makes Instagram measure again.
 */
export function nextRatio(prev: number | undefined, embed: Embed, pageHeight: number, width: number): number | undefined {
  return croppedRatio(embed, pageHeight, width) ?? prev;
}

/** VK's player is called differently in each language; the others are brand names. */
const siteName = (p: Embed["provider"]) => (p === "vk" ? T.player.vk : PROVIDER_NAMES[p]);

const PROVIDER_NAMES: Record<Exclude<Embed["provider"], "vk">, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  rutube: "Rutube",
  dailymotion: "Dailymotion",
};
