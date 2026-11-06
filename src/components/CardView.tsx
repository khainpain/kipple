import { useState } from "react";
import type { Card, Library } from "../lib/types";
import { ACTION_LABELS } from "../lib/types";
import { mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle } from "../lib/library";
import { domainOf } from "../lib/rules";

const KIND_ICON: Record<string, string> = {
  document: "📄",
  voice: "🎙️",
  audio: "🎵",
  video_note: "⭕",
  sticker: "🏷️",
  poll: "📊",
  location: "📍",
  contact: "👤",
  animation: "🎞️",
  video: "🎬",
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

function Img({ src, alt, ratio, fallback }: { src?: string; alt: string; ratio?: number; fallback?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback ? <div className="placeholder">{fallback}</div> : null;
  return (
    <img
      className="card-img"
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={ratio ? { aspectRatio: String(Math.max(ratio, 1 / 1.6)) } : undefined}
      onError={() => setFailed(true)}
    />
  );
}

function Visual({ lib, card }: { lib: Library; card: Card }) {
  const m = card.media;
  const ratio = m?.width && m?.height ? m.width / m.height : undefined;
  if (card.kind === "photo") {
    if (m?.missing) return <div className="placeholder">Фото не было в экспорте</div>;
    return (
      <div className="visual">
        <Img src={mediaUrl(lib, m?.path)} alt={card.text.slice(0, 60)} ratio={ratio} fallback="Файл фото не найден в папке экспорта" />
        {card.album && <span className="badge-corner">+{card.album.length}</span>}
      </div>
    );
  }
  if (card.kind === "video" || card.kind === "animation") {
    const thumb = mediaUrl(lib, m?.thumb);
    return (
      <div className="visual">
        {thumb ? <Img src={thumb} alt="" ratio={ratio} /> : <div className="placeholder">{KIND_ICON[card.kind]} {m?.missing ? "Видео не было в экспорте" : "Видео"}</div>}
        {m?.duration ? <span className="badge-corner">{formatDuration(m.duration)}</span> : null}
      </div>
    );
  }
  if (card.kind === "link" && card.link?.image) {
    return (
      <div className="visual">
        <Img src={card.link.image} alt="" />
      </div>
    );
  }
  return null;
}

export function CardView(props: {
  lib: Library;
  card: Card;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: (range: boolean) => void;
  onJunk: () => void;
}) {
  const { card, lib } = props;
  const action = effectiveAction(card);
  const tags = effectiveTags(card).slice(0, 4);
  const title = effectiveTitle(card);
  const isFile = card.kind === "document" || card.kind === "voice" || card.kind === "audio" || card.kind === "video_note" || card.kind === "sticker";
  const firstUrl = card.urls[0];

  return (
    <article
      className={`card kind-${card.kind}${props.selected ? " selected" : ""}${action === "junk" ? " junk" : ""}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) props.onToggleSelect(e.shiftKey);
        else props.onOpen();
      }}
    >
      <Visual lib={lib} card={card} />
      <div className="card-body">
        {card.kind === "link" && firstUrl && (
          <div className="site">
            {card.link?.favicon && <img src={card.link.favicon} alt="" className="favicon" onError={(e) => (e.currentTarget.style.display = "none")} />}
            <span>{card.link?.siteName ?? domainOf(firstUrl)}</span>
          </div>
        )}
        {isFile && (
          <div className="file">
            <span className="file-icon">{KIND_ICON[card.kind] ?? "📎"}</span>
            <span>
              {card.media?.fileName ?? (card.kind === "voice" ? "Голосовое" : card.kind === "video_note" ? "Кружок" : card.kind === "sticker" ? `Стикер ${card.text}` : "Файл")}
              <small> {[formatSize(card.media?.size), formatDuration(card.media?.duration)].filter(Boolean).join(" · ")}</small>
            </span>
          </div>
        )}
        {title && <h3>{title}</h3>}
        {card.ai?.summary ? (
          <p className="summary">{card.ai.summary}</p>
        ) : card.link?.description ? (
          <p className="summary">{card.link.description.slice(0, 200)}</p>
        ) : null}
        {card.text && card.kind !== "sticker" && <p className="orig">{card.text.slice(0, 280)}</p>}
        <footer>
          {action && <span className={`chip action-${action}`}>{ACTION_LABELS[action]}</span>}
          {card.sensitive && <span className="chip warn" title="Похоже на пароль, ключ или номер карты. Не отправляется в AI.">🔒</span>}
          {tags.map((t) => (
            <span key={t} className="chip tag">
              #{t}
            </span>
          ))}
          <span className="date">{new Date(card.date).toLocaleDateString("ru-RU")}</span>
        </footer>
        {card.forwardedFrom && <div className="from">из «{card.forwardedFrom}»</div>}
      </div>
      <button
        className="quick-junk"
        title={action === "junk" ? "Вернуть из мусора" : "В мусор"}
        onClick={(e) => {
          e.stopPropagation();
          props.onJunk();
        }}
      >
        {action === "junk" ? "↩" : "🗑"}
      </button>
    </article>
  );
}

