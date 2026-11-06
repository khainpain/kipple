import { useEffect, useRef, useState } from "react";
import type { Embed } from "../lib/embeds";
import { T } from "../i18n";
import { Icon } from "./Icon";

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
 * picture the app already has, so opening a card doesn't call Instagram or YouTube.
 */
export function LinkPlayer({ embed, cover }: { embed: Embed; cover?: string }) {
  const [playing, setPlaying] = useState(false);
  const [height, setHeight] = useState<number>();
  const [coverFailed, setCoverFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => setPlaying(false), [embed.src]);

  useEffect(() => {
    if (!playing || !embed.measures) return;
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const h = measuredHeight(e.data);
      if (h) setHeight(h);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [playing, embed.measures]);

  const vertical = embed.ratio < 1;
  const cls = `link-player provider-${embed.provider}${vertical ? " vertical" : ""}`;

  if (!playing) {
    return (
      <button type="button" className={`${cls} facade`} style={{ aspectRatio: String(embed.ratio) }} onClick={() => setPlaying(true)} aria-label={embed.video ? T.player.play : T.player.showPost}>
        {cover && !coverFailed ? <img src={cover} alt="" onError={() => setCoverFailed(true)} /> : <span className="facade-blank" />}
        <span className="play-btn">
          <Icon name="play" size={26} />
        </span>
        <span className="facade-hint">{embed.video ? T.player.hint(PROVIDER_NAMES[embed.provider]) : T.player.post(PROVIDER_NAMES[embed.provider])}</span>
      </button>
    );
  }
  return (
    <div className={cls} style={height ? { height } : { aspectRatio: String(embed.ratio) }}>
      <iframe
        ref={frame}
        src={embed.src}
        title={PROVIDER_NAMES[embed.provider]}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      />
    </div>
  );
}

const PROVIDER_NAMES: Record<Embed["provider"], string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  vimeo: "Vimeo",
  tiktok: "TikTok",
};
