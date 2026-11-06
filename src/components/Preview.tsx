import { useEffect, useState } from "react";
import { platform } from "@platform";
import type { Card, Library, MediaRef } from "../lib/types";
import { mediaUrl } from "../lib/importer";
import { Icon } from "./Icon";
import { formatDuration, formatSize } from "./CardView";
import { T } from "../i18n";

const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
const VIDEO = ["mp4", "webm", "mov", "m4v"];
const AUDIO = ["mp3", "ogg", "oga", "opus", "wav", "m4a", "aac", "flac"];
const TEXT = ["txt", "md", "markdown", "csv", "tsv", "json", "log", "xml", "yaml", "yml", "ini", "toml", "html", "css", "js", "ts", "tsx", "jsx", "py", "sh", "sql", "go", "rs", "java", "kt", "c", "cpp", "h", "rb", "php"];
const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "rtf"];
/** Text files above this are shown cut, the whole file opens in its own app. */
const TEXT_LIMIT = 200_000;

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "office" | "other";

function extOf(m: MediaRef): string {
  const name = m.fileName ?? m.path ?? "";
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

/** What the card's file can be shown as inside the app. */
export function previewKind(card: Card): PreviewKind | null {
  const m = card.media;
  if (!m || card.kind === "photo" || card.kind === "sticker") return null;
  if (card.kind === "video" || card.kind === "animation" || card.kind === "video_note") return "video";
  if (card.kind === "audio" || card.kind === "voice") return "audio";
  const ext = extOf(m);
  const mime = m.mime ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || IMAGE.includes(ext)) return "image";
  if (mime.startsWith("video/") || VIDEO.includes(ext)) return "video";
  if (mime.startsWith("audio/") || AUDIO.includes(ext)) return "audio";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT.includes(ext)) return "text";
  if (OFFICE.includes(ext)) return "office";
  return "other";
}

/** Reads the file as a blob URL, so PDFs open in the built-in viewer and text can be shown. */
function useBlob(lib: Library, rel: string | undefined, type: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ url?: string; blob?: Blob; error?: string }>({});
  useEffect(() => {
    if (!enabled || !rel) return;
    let url: string | undefined;
    let alive = true;
    platform.readMedia(lib.sourceDir, rel).then(
      (b) => {
        if (!alive) return;
        const typed = type ? new Blob([b], { type }) : b;
        url = URL.createObjectURL(typed);
        setState({ url, blob: typed });
      },
      (e) => alive && setState({ error: String(e) }),
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [lib.sourceDir, rel, type, enabled]);
  return state;
}

function TextView({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    blob.slice(0, TEXT_LIMIT).text().then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, [blob]);
  if (text === null) return <div className="preview-note">{T.preview.reading}</div>;
  return (
    <pre className="preview-text">
      {text}
      {blob.size > TEXT_LIMIT && <span className="preview-cut">{"\n"}{T.preview.cut}</span>}
    </pre>
  );
}

/** The card's file shown in place: player, PDF viewer, picture or text. Falls back to a file row with an Open button. */
export function Preview({ lib, card }: { lib: Library; card: Card }) {
  const m = card.media;
  const kind = previewKind(card);
  const needsBlob = kind === "pdf" || kind === "text";
  const { url: blobUrl, blob, error } = useBlob(lib, m?.path, kind === "pdf" ? "application/pdf" : undefined, needsBlob);
  const [failed, setFailed] = useState(false);
  if (!m || !kind) return null;

  const src = m.path ? mediaUrl(lib, m.path) : undefined;
  const open = () => m.path && platform.openFile(lib.sourceDir, m.path);
  const meta = [m.fileName, formatSize(m.size), formatDuration(m.duration)].filter(Boolean).join(" · ");
  const fileRow = (hint?: string) => (
    <div className="preview-file">
      <Icon name={kind === "audio" ? "music" : kind === "video" ? "video" : "file"} size={22} />
      <div className="preview-file-text">
        <b>{m.fileName ?? (kind === "audio" ? T.card.kindAudio : kind === "video" ? T.card.kindVideo : T.card.kindFile)}</b>
        <small>{[formatSize(m.size), hint].filter(Boolean).join(" · ")}</small>
      </div>
      {m.path && (
        <button className="secondary small-btn" onClick={open}>
          <Icon name="external" size={14} /> {T.common.open}
        </button>
      )}
    </div>
  );

  if (m.missing || !m.path) {
    return fileRow(m.inTelegram && !m.missing ? T.preview.inTelegram : T.preview.notExported);
  }
  if (failed || error) return fileRow(T.preview.cannotShow);

  switch (kind) {
    case "image":
      return (
        <figure className="preview">
          <img className="preview-image" src={src} alt="" onError={() => setFailed(true)} />
          {meta && <figcaption>{meta}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <figure className="preview">
          <video
            className={`preview-video${card.kind === "video_note" ? " round" : ""}`}
            src={src}
            poster={m.thumb ? mediaUrl(lib, m.thumb) : undefined}
            controls
            preload="metadata"
            autoPlay={card.kind === "animation"}
            loop={card.kind === "animation"}
            muted={card.kind === "animation"}
            playsInline
            onError={() => setFailed(true)}
          />
          {meta && card.kind !== "animation" && <figcaption>{meta}</figcaption>}
        </figure>
      );
    case "audio":
      return (
        <figure className="preview">
          <audio className="preview-audio" src={src} controls preload="metadata" onError={() => setFailed(true)} />
          <figcaption>{meta || (card.kind === "voice" ? T.card.voice : "")}</figcaption>
        </figure>
      );
    case "pdf":
      return blobUrl ? (
        <figure className="preview">
          <iframe className="preview-pdf" src={blobUrl} title={m.fileName ?? "PDF"} />
          <figcaption>
            {meta}
            <button className="link-btn" onClick={open}>
              {T.preview.openSeparately}
            </button>
          </figcaption>
        </figure>
      ) : (
        <div className="preview-note">{T.preview.openingPdf}</div>
      );
    case "text":
      return blob ? (
        <figure className="preview">
          <TextView blob={blob} />
          <figcaption>{meta}</figcaption>
        </figure>
      ) : (
        <div className="preview-note">{T.preview.reading}</div>
      );
    case "office":
      return fileRow(T.preview.office);
    default:
      return fileRow();
  }
}
