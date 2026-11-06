import { useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import type { Action, Card, Library, UserFields } from "../lib/types";
import { ACTIONS, actionLabel } from "../lib/types";
import { T, locale } from "../i18n";
import { mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { Icon } from "./Icon";
import { coverOf, displayTitle, siteOf } from "./CardView";
import { Preview } from "./Preview";
import { LinkPlayer } from "./LinkPlayer";
import { embedOf, linkText } from "../lib/embeds";
import { isImportant } from "../lib/smart";
import { OPEN_MODES, PANEL_WIDTH, clampPanelWidth, hueOf, loadPanelWidth, savePref, type OpenMode } from "./nav";
import { TopicMenu } from "./TopicMenu";

/**
 * The full card. Opens the way the user picked: centered over the board (default),
 * as a panel on the right next to the board, or over the whole window.
 * Arrow keys step through cards in every mode.
 */
export function Detail(props: {
  lib: Library;
  card: Card;
  topics: string[];
  mode: OpenMode;
  onMode: (m: OpenMode) => void;
  onNameImage?: () => void;
  onClose: () => void;
  onEdit: (patch: UserFields) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { card, lib } = props;
  const side = props.mode === "side";
  const panelRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(loadPanelWidth);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState(effectiveTitle(card));
  const [topic, setTopic] = useState(effectiveTopic(card) ?? "");
  const [topicAt, setTopicAt] = useState<HTMLElement | null>(null);
  const [tags, setTags] = useState(effectiveTags(card).join(", "));
  const [note, setNote] = useState(card.user?.note ?? "");
  const action = effectiveAction(card);
  const photos = card.kind === "photo" ? [card.media, ...(card.album ?? [])].filter((m) => m?.path) : [];
  const cover = card.kind !== "photo" ? coverOf(lib, card).src : undefined;
  const site = siteOf(card);
  const embed = card.kind === "link" ? embedOf(card.urls[0]) : undefined;
  const linked = linkText(card.link);
  // The page's own description (an Instagram caption, a video blurb), unless it just repeats the heading.
  const description = linked.description && linked.description.trim() !== (title || linked.title || "").trim() ? linked.description : undefined;
  const [moreDesc, setMoreDesc] = useState(false);

  function saveText() {
    const patch: UserFields = {};
    if (title !== effectiveTitle(card)) patch.title = title.trim();
    if (topic !== (effectiveTopic(card) ?? "")) patch.topic = topic.trim();
    const t = tags
      .split(",")
      .map((x) => x.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);
    if (t.join(",") !== effectiveTags(card).join(",")) patch.tags = t;
    if (note !== (card.user?.note ?? "")) patch.note = note;
    if (Object.keys(patch).length) props.onEdit(patch);
  }

  /** Width shared by the board and the panel: the workspace minus the sidebar. */
  function room(): number {
    const el = panelRef.current;
    const ws = el?.parentElement;
    if (!el || !ws) return window.innerWidth;
    const sidebar = ws.querySelector<HTMLElement>(":scope > .sidebar");
    return ws.clientWidth - (sidebar?.offsetWidth ?? 0);
  }

  function resizeTo(w: number) {
    const next = clampPanelWidth(w, room());
    setWidth(next);
    savePref("panelWidth", String(next));
  }

  // Keep the saved width inside the safe zone when the window or the sidebar changes.
  useEffect(() => {
    if (!side) return;
    const fit = () => setWidth((w) => clampPanelWidth(w, room()));
    fit();
    const ws = panelRef.current?.parentElement;
    const ro = ws && typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ws) ro?.observe(ws);
    return () => ro?.disconnect();
  }, [side]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const space = room();
    let last = startW;
    setDragging(true);
    document.documentElement.classList.add("col-resizing");
    const move = (ev: PointerEvent) => {
      // The handle is on the left edge: dragging left makes the panel wider.
      last = clampPanelWidth(startW + (startX - ev.clientX), space);
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(false);
      document.documentElement.classList.remove("col-resizing");
      savePref("panelWidth", String(last));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onHandleKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? PANEL_WIDTH.step * 4 : PANEL_WIDTH.step;
    if (e.key === "ArrowLeft") resizeTo(width + step);
    else if (e.key === "ArrowRight") resizeTo(width - step);
    else if (e.key === "Home") resizeTo(PANEL_WIDTH.min);
    else if (e.key === "End") resizeTo(PANEL_WIDTH.max);
    else if (e.key === "Enter") resizeTo(PANEL_WIDTH.default);
    else return;
    // Don't let the arrows also step to the previous/next card.
    e.preventDefault();
    e.stopPropagation();
  }

  const panel = (
    <aside
      ref={panelRef}
      className={`detail-panel mode-${props.mode}${dragging ? " resizing" : ""}`}
      style={side ? { width } : undefined}
      aria-label={T.detail.label}
      onClick={(e) => e.stopPropagation()}
    >
      {side && (
        <div
          className="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={T.detail.resize}
          aria-valuenow={width}
          aria-valuemin={PANEL_WIDTH.min}
          aria-valuemax={PANEL_WIDTH.max}
          title={T.detail.resize}
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => resizeTo(PANEL_WIDTH.default)}
          onKeyDown={onHandleKey}
        />
      )}
      <header className="detail-head">
        <button className="icon-btn" onClick={props.onPrev} disabled={!props.onPrev} title={T.detail.prev}>
          <Icon name="up" />
        </button>
        <button className="icon-btn" onClick={props.onNext} disabled={!props.onNext} title={T.detail.next}>
          <Icon name="down" />
        </button>
        <span className="spacer" />
        <div className="segmented small" role="radiogroup" aria-label={T.detail.openModes}>
          {OPEN_MODES.map((m) => (
            <button key={m.key} role="radio" aria-checked={props.mode === m.key} className={props.mode === m.key ? "on" : ""} onClick={() => props.onMode(m.key)} title={m.label}>
              <Icon name={m.icon} size={15} />
            </button>
          ))}
        </div>
        <button
          className={`icon-btn${isImportant(card) ? " on" : ""}`}
          onClick={() => props.onEdit({ pinned: !isImportant(card) })}
          title={isImportant(card) ? T.card.unpin : T.card.pin}
          aria-pressed={isImportant(card)}
        >
          <Icon name="star" />
        </button>
        {card.media?.path && card.kind !== "photo" && (
          <button className="icon-btn" onClick={() => platform.openFile(lib.sourceDir, card.media!.path!)} title={T.detail.openFile}>
            <Icon name="file" />
          </button>
        )}
        {card.urls[0] && (
          <button className="secondary small-btn" onClick={() => platform.openUrl(card.urls[0])}>
            <Icon name="external" size={14} /> {T.common.open}
          </button>
        )}
        <button className="icon-btn" onClick={props.onClose} title={T.detail.closeEsc} aria-label={T.common.close}>
          <Icon name="close" />
        </button>
      </header>

      <div className="detail-scroll">
        <div className="detail-body">
        {photos.length > 0 && (
          <div className="detail-photos">
            {photos.map((m) => (
              <img key={m!.path} src={mediaUrl(lib, m!.path)} alt="" />
            ))}
          </div>
        )}
        {embed ? (
          <LinkPlayer embed={embed} cover={cover} />
        ) : (
          cover && <img className="detail-cover" src={cover} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        {site && <div className="detail-site">{[site, linked.author].filter(Boolean).join(" · ")}</div>}

        <Preview lib={lib} card={card} />

        <textarea
          className="detail-title"
          rows={1}
          value={title}
          placeholder={displayTitle({ ...card, user: { ...card.user, title: undefined } }) || T.detail.titlePlaceholder}
          title={T.detail.titleEditable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        />
        {(!title || props.onNameImage) && card.kind === "photo" && (
          <div className="title-help">
            {!title && <span>{card.context ? T.detail.titleFromContext : T.detail.noCaption} {T.detail.writeOwn}</span>}
            {props.onNameImage && !card.user?.title && (
              <button className="link-btn" onClick={props.onNameImage} title={T.detail.nameImageHint}>
                <Icon name="sparkle" size={13} /> {card.ai ? T.detail.renameImage : T.detail.nameImage}
              </button>
            )}
          </div>
        )}
        {description && (
          <div className={`detail-desc${moreDesc ? " open" : ""}`}>
            <p>{description}</p>
            {description.length > 280 && (
              <button className="link-btn" onClick={() => setMoreDesc(!moreDesc)}>
                {moreDesc ? T.detail.less : T.detail.more}
              </button>
            )}
          </div>
        )}
        {card.ai?.summary && !description && <p className="detail-summary">{card.ai.summary}</p>}

        <div className="field">
          <span>{T.detail.status}</span>
          <div className="actions">
            {ACTIONS.map((a: Action) => (
              <button key={a} className={`pill action-${a}${action === a ? " on" : ""}`} onClick={() => props.onEdit({ action: a })}>
                {actionLabel(a)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span id="detail-topic-label">{T.detail.topic}</span>
          <button
            type="button"
            className={`select-btn${topicAt ? " open" : ""}`}
            aria-haspopup="listbox"
            aria-expanded={!!topicAt}
            aria-labelledby="detail-topic-label"
            onClick={(e) => setTopicAt(topicAt ? null : e.currentTarget)}
          >
            {topic ? <span className="topic-dot" style={{ "--h": hueOf(topic) } as React.CSSProperties} /> : null}
            <span className={`label${topic ? "" : " placeholder"}`}>{topic || T.nav.noTopic}</span>
            <Icon name="down" size={12} className="chev" />
          </button>
          {topicAt && (
            <TopicMenu
              anchor={topicAt}
              matchAnchor
              topics={props.topics}
              current={topic || undefined}
              onPick={(t) => {
                setTopic(t);
                if (t !== (effectiveTopic(card) ?? "")) props.onEdit({ topic: t });
              }}
              onClose={() => {
                setTopicAt(null);
                topicAt.focus();
              }}
            />
          )}
        </div>
        <label className="field">
          <span>{T.detail.tags}</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveText} />
        </label>
        <label className="field">
          <span>{T.detail.note}</span>
          <textarea rows={2} value={note} placeholder={T.detail.notePlaceholder} onChange={(e) => setNote(e.target.value)} onBlur={saveText} />
        </label>

        {card.urls.length > 0 && (
          <div className="field">
            <span>{T.detail.links}</span>
            <div className="links">
              {card.urls.map((u) => (
                <a key={u} href="#" onClick={(e) => (e.preventDefault(), platform.openUrl(u))}>
                  {u}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span>{T.detail.message}</span>
          <pre className="orig-full">{card.text || T.detail.noText}</pre>
        </div>
        <div className="meta">
          {[
            new Date(card.date).toLocaleString(locale()),
            T.detail.messageId(card.id),
            card.forwardedFrom && T.detail.from(card.forwardedFrom),
            card.ai && T.detail.taggedBy(card.ai.model),
            card.sensitive && T.detail.notSentToAi,
            card.removed && T.detail.removed,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <button className="link-btn" onClick={() => props.onEdit({ hidden: !card.user?.hidden })}>
          {card.user?.hidden ? T.detail.show : T.detail.hide}
        </button>
        </div>
      </div>
    </aside>
  );

  if (props.mode === "side") return panel;
  return (
    <div className={`peek-backdrop mode-${props.mode}`} onClick={props.onClose}>
      {panel}
    </div>
  );
}
