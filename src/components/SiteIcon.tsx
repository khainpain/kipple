import { useId, useState } from "react";
import { publicAssetUrl } from "../lib/assetUrl";
import { hostChain, siteLetter, siteMarkOf } from "../lib/siteMarks";
import { hueOf } from "./nav";
import { Icon } from "./Icon";

/**
 * Small site mark next to a link's site name: a built-in brand icon for common sites,
 * otherwise the favicon the page itself declared, otherwise the site's first letter on a muted
 * tile (one colour per site), otherwise a neutral globe.
 */
export function SiteIcon({ url, favicon, size = 14 }: { url?: string; favicon?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const gradId = useId();
  const mark = siteMarkOf(url);
  if (mark) {
    const instagram = mark.title === "Instagram";
    return (
      <svg className="site-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {instagram && (
          <defs>
            <radialGradient id={gradId} cx="0.25" cy="1.05" r="1.2">
              <stop offset="0" stopColor="#FFD776" />
              <stop offset="0.25" stopColor="#F3A554" />
              <stop offset="0.5" stopColor="#F13D6D" />
              <stop offset="0.8" stopColor="#C12FA8" />
              <stop offset="1" stopColor="#5B4FE9" />
            </radialGradient>
          </defs>
        )}
        <path d={mark.path} fill={instagram ? `url(#${gradId})` : (mark.color ?? "currentColor")} />
      </svg>
    );
  }
  const icon = publicAssetUrl(favicon);
  if (icon && !broken) return <img src={icon} alt="" className="favicon" width={size} height={size} onError={() => setBroken(true)} />;
  const letter = siteLetter(url);
  if (letter) {
    return (
      <span className="site-letter" aria-hidden="true" style={{ "--h": hueOf(hostChain(url)[0]!.replace(/^www\./, "")), "--sz": `${size}px` } as React.CSSProperties}>
        {letter}
      </span>
    );
  }
  return <Icon name="globe" size={size} className="site-icon generic" />;
}
