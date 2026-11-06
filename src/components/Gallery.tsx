import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Library, MediaRef } from "../lib/types";
import { mediaUrl } from "../lib/importer";
import { T } from "../i18n";
import { Icon } from "./Icon";

const isVideo = (m: MediaRef) => !!m.mime?.startsWith("video") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(m.path ?? "");

function typing(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/**
 * Photos of an album: one frame at a time, kept whole (never cropped), with arrows on hover,
 * a "2 / 5" counter and dots. Pages with ←/→, a horizontal trackpad swipe, touch swipe or
 * shift + wheel. A click on a frame opens it over the whole window with the same navigation.
 */
export function Gallery(props: { lib: Library; items: MediaRef[] }) {
  const { lib, items } = props;
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // A new card starts from its first frame.
  const key = items.map((m) => m.path).join("|");
  useEffect(() => {
    setIndex(0);
    setZoomed(false);
  }, [key]);

  // ←/→ page the album while the card is open (↑/↓ still step through cards).
  useEffect(() => {
    if (items.length < 2 || zoomed) return;
    function onKey(e: KeyboardEvent) {
      if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, zoomed]);

  if (!items.length) return null;
  // The frame keeps the shape of the tallest photo, so paging doesn't make the card jump.
  const known = items.filter((m) => m.width && m.height).map((m) => m.width! / m.height!);
  const ratio = known.length ? Math.min(...known) : 4 / 3;

  return (
    <>
      <Carousel lib={lib} items={items} index={index} onIndex={setIndex} onZoom={() => setZoomed(true)} ratio={ratio} />
      {zoomed && <Lightbox lib={lib} items={items} index={index} onIndex={setIndex} onClose={() => setZoomed(false)} />}
    </>
  );
}

/** A scroll-snap track that follows `index` and reports where the user swiped to. */
function Carousel(props: {
  lib: Library;
  items: MediaRef[];
  index: number;
  onIndex: (i: number) => void;
  onZoom?: () => void;
  ratio?: number;
  full?: boolean;
}) {
  const { lib, items, index, onIndex } = props;
  const track = useRef<HTMLDivElement>(null);
  const many = items.length > 1;

  // Scroll to the current frame when it changes from a button, a dot or a key.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const left = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) < 2) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, [index]);

  // Start at the right frame without animating (the lightbox opens on the frame you clicked).
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = useRef(0);
  const onScroll = useCallback(() => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = track.current;
      if (!el || !el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== index) onIndex(Math.max(0, Math.min(items.length - 1, i)));
    }, 90);
  }, [index, items.length, onIndex]);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const go = (d: number) => onIndex(Math.max(0, Math.min(items.length - 1, index + d)));

  return (
    <div
      className={`carousel${props.full ? " full" : ""}${many ? " many" : ""}`}
      style={props.ratio ? ({ "--ratio": props.ratio } as React.CSSProperties) : undefined}
      role={many ? "region" : undefined}
      aria-roledescription={many ? "carousel" : undefined}
      aria-label={many ? T.gallery.label : undefined}
    >
      <div className="carousel-track" ref={track} onScroll={many ? onScroll : undefined}>
        {items.map((m, i) => (
          <div className="carousel-slide" key={`${m.path}-${i}`} aria-hidden={i !== index} aria-label={many ? T.gallery.of(i + 1, items.length) : undefined}>
            {isVideo(m) ? (
              <video
                src={mediaUrl(lib, m.path)}
                poster={m.thumb ? mediaUrl(lib, m.thumb) : undefined}
                controls
                preload="metadata"
                tabIndex={i === index ? 0 : -1}
              />
            ) : (
              <img
                src={mediaUrl(lib, m.path)}
                alt=""
                draggable={false}
                loading={Math.abs(i - index) > 1 ? "lazy" : "eager"}
                onClick={props.onZoom}
                className={props.onZoom ? "zoomable" : undefined}
                title={props.onZoom ? T.gallery.zoom : undefined}
              />
            )}
          </div>
        ))}
      </div>
      {many && (
        <>
          <button className="carousel-arrow prev" onClick={() => go(-1)} disabled={index === 0} title={T.gallery.prev} aria-label={T.gallery.prev}>
            <Icon name="left" size={20} />
          </button>
          <button className="carousel-arrow next" onClick={() => go(1)} disabled={index === items.length - 1} title={T.gallery.next} aria-label={T.gallery.next}>
            <Icon name="right" size={20} />
          </button>
          <span className="carousel-count" aria-live="polite">
            {index + 1} / {items.length}
          </span>
          {items.length <= 15 && (
            <div className="carousel-dots">
              {items.map((_, i) => (
                <button key={i} className={i === index ? "on" : ""} onClick={() => onIndex(i)} aria-label={T.gallery.of(i + 1, items.length)} aria-current={i === index} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The album over the whole window. Esc closes only this, not the card under it. */
function Lightbox(props: { lib: Library; items: MediaRef[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { items, index, onIndex, onClose } = props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Capture phase on window runs before the board's own key handler, so ↑/↓ and Esc stay here.
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (e.key === "ArrowRight") onIndex(Math.min(items.length - 1, index + 1));
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        /* swallow: don't switch cards behind the lightbox */
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items.length, onIndex, onClose]);

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={T.gallery.label}
      // A click on the dark area around the photo closes; on the photo or the controls it doesn't.
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t === e.currentTarget || t.classList.contains("carousel-slide") || t.classList.contains("lightbox-inner")) onClose();
      }}
    >
      <div className="lightbox-inner">
        <Carousel lib={props.lib} items={items} index={index} onIndex={onIndex} full />
      </div>
      <button className="lightbox-close" onClick={onClose} title={T.detail.closeEsc} aria-label={T.common.close}>
        <Icon name="close" size={20} />
      </button>
    </div>,
    document.body,
  );
}
