import { useState } from "react";
import type { Card, Library } from "../lib/types";
import { actionLabel } from "../lib/types";
import { T, formatNumber, locale } from "../i18n";
import { mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { domainOf } from "../lib/rules";
import { instantImage, isVideoLink, linkText } from "../lib/embeds";
import { isImportant } from "../lib/smart";
import { TopicMenu } from "./TopicMenu";
import { Icon } from "./Icon";
import { SiteIcon } from "./SiteIcon";
import { hueOf, type CardField, type CardLook, type ViewKey } from "./nav";

const KIND_ICON: Record<string, string> = {
  document: "file",
  voice: "mic",
  audio: "music",
  video_note: "video",
  sticker: "sparkle",
  poll: "chart",
  location: "pin",
  contact: "user",
  animation: "video",
  video: "video",
  photo: "photo",
  link: "link",
  text: "text",
};

function kindName(kind: string): string | undefined {
  const k = T.card;
  return ({ photo: k.kindPhoto, video: k.kindVideo, animation: k.kindGif, document: k.kindFile, audio: k.kindAudio } as Record<string, string>)[kind];
}

export function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const units = T.card.sizeUnits;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v < 10 && i > 0 ? 1 : 0;
  return `${v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[i]}`;
}

export function formatDuration(s?: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale(), sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** The picture a card can show, if any: photo, video thumbnail or link preview image. */
export function coverOf(lib: Library, card: Card): { src?: string; ratio?: number; missing?: string } {
  const m = card.media;
  const ratio = m?.width && m?.height ? m.width / m.height : undefined;
  if (card.kind === "photo") return m?.missing ? { missing: T.card.photoMissing } : { src: mediaUrl(lib, m?.path), ratio };
  if (card.kind === "video" || card.kind === "animation") return { src: mediaUrl(lib, m?.thumb), ratio, missing: m?.missing ? T.card.videoMissing : undefined };
  if (card.kind === "link") {
    // Telegram's own copy first (already on disk), then the page's og:image, then known sites.
    const src = mediaUrl(lib, card.preview?.path) ?? card.link?.image ?? instantImage(card.urls[0]);
    if (src) return { src };
  }
  return {};
}

export function siteOf(card: Card): string | undefined {
  const u = card.urls[0];
  if (!u) return undefined;
  return card.link?.siteName ?? domainOf(u);
}

/** Title shown on the card: edited/AI/page title, else a file name or the first line of the text. */
export function displayTitle(card: Card): string {
  const t = effectiveTitle(card);
  if (t) return t;
  if (card.context) return card.context;
  if (card.media?.fileName) return card.media.fileName;
  if (card.kind === "voice") return T.card.voice;
  if (card.kind === "video_note") return T.card.videoNote;
  if (card.kind === "sticker") return T.card.sticker(card.text);
  const line = card.text.split("\n").find((l) => l.trim());
  if (line) return line.slice(0, 120);
  const site = siteOf(card);
  if (site) return site;
  const kind = kindName(card.kind);
  return kind ? `${kind}, ${formatDate(card.date)}` : T.common.untitled;
}

function excerptOf(card: Card): string {
  const title = displayTitle(card);
  const link = linkText(card.link);
  const s = card.ai?.summary || link.description || link.author || card.text;
  if (!s || s.trim() === title.trim() || card.kind === "sticker") return "";
  return s.slice(0, 320);
}

/** Cover placeholder for cards without a picture: a tinted tile with the type icon and site or topic. */
function Tile({ card, compact }: { card: Card; compact?: boolean }) {
  const label = siteOf(card) ?? effectiveTopic(card) ?? "";
  const hue = hueOf(label || card.kind);
  return (
    <div className={`tile${compact ? " compact" : ""}`} style={{ "--h": hue } as React.CSSProperties}>
      <Icon name={KIND_ICON[card.kind] ?? "file"} size={compact ? 20 : 28} />
      {!compact && label && <span>{label}</span>}
    </div>
  );
}

function Cover({ lib, card, view }: { lib: Library; card: Card; view: ViewKey }) {
  const [failed, setFailed] = useState(false);
  const c = coverOf(lib, card);
  const fixed = view !== "masonry";
  if (!c.src || failed) {
    if (fixed) return <div className="cover">{<Tile card={card} compact={view === "list"} />}</div>;
    if (c.missing || (card.kind === "photo" && failed)) return <div className="cover-note">{c.missing ?? T.card.photoNotFound}</div>;
    return null;
  }
  return (
    <div className="cover">
      <img
        src={c.src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={!fixed && c.ratio ? { aspectRatio: String(Math.max(c.ratio, 1 / 1.6)) } : undefined}
        onError={() => setFailed(true)}
      />
      {card.kind === "link" && isVideoLink(card.urls[0]) && (
        <span className="play-mark" aria-hidden="true">
          <Icon name="play" size={view === "list" ? 14 : 20} />
        </span>
      )}
      {card.album && <span className="badge-corner">+{formatNumber(card.album.length)}</span>}
      {card.media?.duration && (card.kind === "video" || card.kind === "animation") ? <span className="badge-corner">{formatDuration(card.media.duration)}</span> : null}
    </div>
  );
}

export function CardView(props: {
  lib: Library;
  card: Card;
  view: ViewKey;
  /** Hidden fields and list cover side; the overview leaves it out and shows everything. */
  look?: CardLook;
  selected: boolean;
  active: boolean;
  selecting: boolean;
  onOpen: () => void;
  onToggleSelect: (range: boolean) => void;
  onJunk: () => void;
  onPin: () => void;
  /** Topics to offer in "Move to topic", and moving there ("" = no topic). */
  topics: string[];
  onMove: (topic: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const { card, lib, view } = props;
  const [moveAt, setMoveAt] = useState<HTMLElement | null>(null);
  const action = effectiveAction(card);
  const important = isImportant(card);
  const hidden = props.look?.hidden[view] ?? [];
  const show = (f: CardField) => !hidden.includes(f);
  const tags = (show("tags") ? effectiveTags(card) : []).slice(0, view === "headlines" ? 3 : 4);
  const title = displayTitle(card);
  const excerpt = view === "headlines" || !show("excerpt") ? "" : excerptOf(card);
  const site = siteOf(card);
  const fileMeta = [formatSize(card.media?.size), card.kind === "video" ? "" : formatDuration(card.media?.duration)].filter(Boolean).join(" · ");

  const cls = ["card", `view-${view}`, `kind-${card.kind}`, props.selected && "selected", props.active && "active", action === "junk" && "junk", props.selecting && "selecting", moveAt && "menu-open", !show("cover") && "no-cover", view === "list" && props.look?.coverSide === "right" && "cover-right"]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={cls}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || props.selecting) props.onToggleSelect(e.shiftKey);
        else props.onOpen();
      }}
    >
      {view !== "headlines" && show("cover") && <Cover lib={lib} card={card} view={view} />}
      {view === "headlines" && (
        <span className="kind-dot">
          <Icon name={KIND_ICON[card.kind] ?? "file"} size={15} />
        </span>
      )}
      <div className="card-body">
        {show("title") && <h3 title={title}>{title}</h3>}
        {excerpt && <p className="excerpt">{excerpt}</p>}
        {show("tags") && (tags.length > 0 || action || card.sensitive || important) && view !== "headlines" && (
          <div className="tags">
            {important && (
              <span className="pill important" title={T.card.important}>
                <Icon name="star" size={12} />
              </span>
            )}
            {action && action !== "junk" && <span className={`pill action-${action}`}>{actionLabel(action)}</span>}
            {card.sensitive && (
              <span className="pill warn" title={T.card.sensitive}>
                <Icon name="lock" size={12} />
              </span>
            )}
            {tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
        {(show("info") || (view === "headlines" && tags.length > 0)) && (
          <div className="meta-row">
            {show("info") && (
              <>
                {site && <SiteIcon url={card.urls[0]} favicon={card.link?.favicon} />}
                {site && <span className="site">{site}</span>}
                {!site && fileMeta && <span>{fileMeta}</span>}
                {!site && !fileMeta && card.forwardedFrom && <span className="site">{card.forwardedFrom}</span>}
              </>
            )}
            {view === "headlines" &&
              tags.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            {show("info") && <span className="date">{formatDate(card.date)}</span>}
          </div>
        )}
      </div>
      <div className="hover-actions" onClick={(e) => e.stopPropagation()}>
        <button className={`ha sel${props.selected ? " on" : ""}`} title={T.card.select} onClick={() => props.onToggleSelect(false)}>
          <Icon name="select" size={15} />
        </button>
        <button className={`ha${important ? " on" : ""}`} title={important ? T.card.unpin : T.card.pin} onClick={props.onPin}>
          <Icon name="star" size={15} />
        </button>
        <button className={`ha${moveAt ? " on" : ""}`} title={T.move.button} onClick={(e) => setMoveAt(moveAt ? null : e.currentTarget)}>
          <Icon name="folder" size={15} />
        </button>
        {moveAt && <TopicMenu anchor={moveAt} topics={props.topics} current={effectiveTopic(card)} onPick={props.onMove} onClose={() => setMoveAt(null)} />}
        {card.urls[0] && (
          <button className="ha" title={T.card.openLink} onClick={() => props.onOpenLink(card.urls[0])}>
            <Icon name="external" size={15} />
          </button>
        )}
        <button className="ha" title={action === "junk" ? T.card.restore : T.card.toJunk} onClick={props.onJunk}>
          <Icon name={action === "junk" ? "restore" : "trash"} size={15} />
        </button>
      </div>
    </article>
  );
}
