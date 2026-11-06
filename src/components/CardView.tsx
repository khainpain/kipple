import { useState } from "react";
import type { Card, Library } from "../lib/types";
import { ACTION_LABELS } from "../lib/types";
import { mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { domainOf } from "../lib/rules";
import { Icon } from "./Icon";
import { hueOf, type ViewKey } from "./nav";

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

export function formatSize(bytes?: number): string {
  if (!bytes) return "";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(s?: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** The picture a card can show, if any: photo, video thumbnail or link preview image. */
export function coverOf(lib: Library, card: Card): { src?: string; ratio?: number; missing?: string } {
  const m = card.media;
  const ratio = m?.width && m?.height ? m.width / m.height : undefined;
  if (card.kind === "photo") return m?.missing ? { missing: "Фото не было в экспорте" } : { src: mediaUrl(lib, m?.path), ratio };
  if (card.kind === "video" || card.kind === "animation") return { src: mediaUrl(lib, m?.thumb), ratio, missing: m?.missing ? "Видео не было в экспорте" : undefined };
  if (card.kind === "link" && card.link?.image) return { src: card.link.image };
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
  if (card.media?.fileName) return card.media.fileName;
  if (card.kind === "voice") return "Голосовое сообщение";
  if (card.kind === "video_note") return "Видеосообщение";
  if (card.kind === "sticker") return `Стикер ${card.text}`;
  const line = card.text.split("\n").find((l) => l.trim());
  return line ? line.slice(0, 120) : siteOf(card) ?? "Без названия";
}

function excerptOf(card: Card): string {
  const title = displayTitle(card);
  const s = card.ai?.summary || card.link?.description || card.text;
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
    if (c.missing || (card.kind === "photo" && failed)) return <div className="cover-note">{c.missing ?? "Файл фото не найден в папке экспорта"}</div>;
    return null;
  }
  return (
    <div className="cover">
      <img
        src={c.src}
        alt=""
        loading="lazy"
        decoding="async"
        style={!fixed && c.ratio ? { aspectRatio: String(Math.max(c.ratio, 1 / 1.6)) } : undefined}
        onError={() => setFailed(true)}
      />
      {card.album && <span className="badge-corner">+{card.album.length}</span>}
      {card.media?.duration && (card.kind === "video" || card.kind === "animation") ? <span className="badge-corner">{formatDuration(card.media.duration)}</span> : null}
    </div>
  );
}

export function CardView(props: {
  lib: Library;
  card: Card;
  view: ViewKey;
  selected: boolean;
  active: boolean;
  selecting: boolean;
  onOpen: () => void;
  onToggleSelect: (range: boolean) => void;
  onJunk: () => void;
  onOpenLink: (url: string) => void;
}) {
  const { card, lib, view } = props;
  const action = effectiveAction(card);
  const tags = effectiveTags(card).slice(0, view === "headlines" ? 3 : 4);
  const title = displayTitle(card);
  const excerpt = view === "headlines" ? "" : excerptOf(card);
  const site = siteOf(card);
  const fileMeta = [formatSize(card.media?.size), card.kind === "video" ? "" : formatDuration(card.media?.duration)].filter(Boolean).join(" · ");

  const cls = ["card", `view-${view}`, `kind-${card.kind}`, props.selected && "selected", props.active && "active", action === "junk" && "junk", props.selecting && "selecting"]
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
      {view !== "headlines" && <Cover lib={lib} card={card} view={view} />}
      {view === "headlines" && (
        <span className="kind-dot">
          <Icon name={KIND_ICON[card.kind] ?? "file"} size={15} />
        </span>
      )}
      <div className="card-body">
        <h3 title={title}>{title}</h3>
        {excerpt && <p className="excerpt">{excerpt}</p>}
        {(tags.length > 0 || action || card.sensitive) && view !== "headlines" && (
          <div className="tags">
            {action && action !== "junk" && <span className={`pill action-${action}`}>{ACTION_LABELS[action]}</span>}
            {card.sensitive && (
              <span className="pill warn" title="Похоже на пароль, ключ или номер карты. Не отправляется в AI.">
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
        <div className="meta-row">
          {site && card.link?.favicon && <img src={card.link.favicon} alt="" className="favicon" onError={(e) => (e.currentTarget.style.display = "none")} />}
          {site && <span className="site">{site}</span>}
          {!site && fileMeta && <span>{fileMeta}</span>}
          {!site && !fileMeta && card.forwardedFrom && <span className="site">{card.forwardedFrom}</span>}
          {view === "headlines" &&
            tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          <span className="date">{formatDate(card.date)}</span>
        </div>
      </div>
      <div className="hover-actions" onClick={(e) => e.stopPropagation()}>
        <button className={`ha${props.selected ? " on" : ""}`} title="Выбрать (Ctrl+клик)" onClick={() => props.onToggleSelect(false)}>
          <Icon name="select" size={15} />
        </button>
        {card.urls[0] && (
          <button className="ha" title="Открыть ссылку" onClick={() => props.onOpenLink(card.urls[0])}>
            <Icon name="external" size={15} />
          </button>
        )}
        <button className="ha" title={action === "junk" ? "Вернуть из мусора" : "В мусор"} onClick={props.onJunk}>
          <Icon name={action === "junk" ? "restore" : "trash"} size={15} />
        </button>
      </div>
    </article>
  );
}
