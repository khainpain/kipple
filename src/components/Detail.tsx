import { useEffect, useRef, useState } from "react";
import { platform } from "@platform";
import type { Card, Library, MediaRef, UserFields } from "../lib/types";
import { T, locale } from "../i18n";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { Icon } from "./Icon";
import { coverOf, displayTitle, siteOf } from "./CardView";
import { SiteIcon } from "./SiteIcon";
import { Preview } from "./Preview";
import { LinkPlayer } from "./LinkPlayer";
import { embedOf, linkText } from "../lib/embeds";
import { Gallery } from "./Gallery";
import { isImportant } from "../lib/smart";
import { OPEN_MODES, PANEL_WIDTH, clampPanelWidth, hueOf, loadPanelWidth, savePref, type OpenMode } from "./nav";
import { TopicMenu } from "./TopicMenu";
import { NoteField, PropRow, StatusChip, TagsEditor } from "./CardProps";
import { openCardFile } from "./openFile";

/** Messages up to this long (and without media or links) are shown as the card's heading. */
const SHORT_TEXT = 140;

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
  /** Phone: always full screen, so the side/center/full switch is left out. */
  narrow?: boolean;
  onMode: (m: OpenMode) => void;
  onNameImage?: () => void;
  onClose: () => void;
  onEdit: (patch: UserFields) => void;
  onOpenInTelegram?: () => Promise<void> | void;
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
  const [tags, setTags] = useState(effectiveTags(card));
  const [note, setNote] = useState(card.user?.note ?? "");
  const action = effectiveAction(card);
  const [opening, setOpening] = useState(false);
  const photos = card.kind === "photo" ? [card.media, ...(card.album ?? [])].filter((m): m is MediaRef => !!m?.path) : [];
  const cover = card.kind !== "photo" ? coverOf(lib, card).src : undefined;
  const site = siteOf(card);
  const embed = card.kind === "link" ? embedOf(card.urls[0]) : undefined;
  const linked = linkText(card.link);
  // The page's own description (an Instagram caption, a video blurb), unless it just repeats the heading.
  const description = linked.description && linked.description.trim() !== (title || linked.title || "").trim() ? linked.description : undefined;
  const [moreDesc, setMoreDesc] = useState(false);
  // A one-liner like "Important, safety": the message itself is the heading, and the AI
  // title and summary (often longer than the message) step back.
  const text = card.text?.trim() ?? "";
  const short = !!text && text.length <= SHORT_TEXT && !text.includes("\n\n") && !photos.length && !cover && !card.media?.path && !card.urls.length;

  // What this panel last saved, so the save on unmount doesn't repeat one a blur just made.
  const saved = useRef<UserFields>({});
  // What the fields held when the panel opened. Only a field the user changed here is saved:
  // the card itself may change meanwhile (moved from the board, a topic deleted, new AI results),
  // and the panel's stale copy must not write that back.
  const opened = useRef({ title, topic, note });
  function saveText() {
    const patch: UserFields = {};
    const at = opened.current;
    if ((title !== at.title || "title" in saved.current) && title !== effectiveTitle(card) && title.trim() !== saved.current.title) patch.title = title.trim();
    if ((topic !== at.topic || "topic" in saved.current) && topic !== (effectiveTopic(card) ?? "") && topic.trim() !== saved.current.topic) patch.topic = topic.trim();
    if ((note !== at.note || "note" in saved.current) && note !== (card.user?.note ?? "") && note !== saved.current.note) patch.note = note;
    if (Object.keys(patch).length) {
      Object.assign(saved.current, patch);
      props.onEdit(patch);
    }
  }

  // The card changed elsewhere (moved from the board, new AI results): fields not touched here follow it.
  const cardTitle = effectiveTitle(card);
  const cardTopic = effectiveTopic(card) ?? "";
  const cardNote = card.user?.note ?? "";
  useEffect(() => {
    const at = opened.current;
    if (title === at.title && !("title" in saved.current) && cardTitle !== at.title) (setTitle(cardTitle), (at.title = cardTitle));
    if (topic === at.topic && !("topic" in saved.current) && cardTopic !== at.topic) (setTopic(cardTopic), (at.topic = cardTopic));
    if (note === at.note && !("note" in saved.current) && cardNote !== at.note) (setNote(cardNote), (at.note = cardNote));
  }, [cardTitle, cardTopic, cardNote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Text is saved on blur; a panel that goes away mid-edit (the phone turned, the next card
  // opened by keyboard) saves what was typed instead of dropping it.
  const saveRef = useRef(saveText);
  saveRef.current = saveText;
  useEffect(() => () => saveRef.current(), []);

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
        {!props.narrow && (
        <div className="segmented small" role="radiogroup" aria-label={T.detail.openModes}>
          {OPEN_MODES.map((m) => (
            <button key={m.key} role="radio" aria-checked={props.mode === m.key} className={props.mode === m.key ? "on" : ""} onClick={() => props.onMode(m.key)} title={m.label}>
              <Icon name={m.icon} size={15} />
            </button>
          ))}
        </div>
        )}
        <button
          className={`icon-btn${isImportant(card) ? " on" : ""}`}
          onClick={() => props.onEdit({ pinned: !isImportant(card) })}
          title={`${isImportant(card) ? T.card.unpin : T.card.pin} (I)`}
          aria-pressed={isImportant(card)}
        >
          <Icon name="star" />
        </button>
        {card.media?.path && card.kind !== "photo" && (
          <button className="icon-btn" onClick={() => openCardFile(lib.sourceDir, card.media!.path!)} title={T.detail.openFile}>
            <Icon name="file" />
          </button>
        )}
        {props.onOpenInTelegram && (
          <button
            className="icon-btn"
            disabled={opening}
            aria-busy={opening}
            onClick={async () => {
              setOpening(true);
              try {
                await props.onOpenInTelegram!();
              } finally {
                setOpening(false);
              }
            }}
            title={T.detail.openInTelegram}
            aria-label={T.detail.openInTelegram}
          >
            <Icon name="send" />
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
        <div className="detail-main">
        <div className="d-media">
        {photos.length > 0 && (
          <Gallery lib={lib} items={photos} />
        )}
        {embed ? (
          <LinkPlayer embed={embed} cover={cover} />
        ) : (
          cover && <img className="detail-cover" src={cover} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        {site && (
          <div className="detail-site">
            <SiteIcon url={card.urls[0]} favicon={card.link?.favicon} />
            {[site, linked.author].filter(Boolean).join(" · ")}
          </div>
        )}

        <Preview lib={lib} card={card} />
        </div>

        <div className="d-head">
        {short ? (
          <>
            <p className="detail-lead">{text}</p>
            <label className="detail-cardname">
              <span>{T.detail.cardName}</span>
              <input
                value={title}
                placeholder={displayTitle({ ...card, user: { ...card.user, title: undefined } }) || T.detail.titlePlaceholder}
                title={T.detail.titleEditable}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveText}
                onKeyDown={(e) => (e.stopPropagation(), e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur()))}
              />
            </label>
          </>
        ) : (
          <>
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
            {card.ai?.summary && !description && <p className="detail-summary">{card.ai.summary}</p>}
          </>
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
        </div>
        <div className="d-rest">
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
        {!short && text && <pre className="orig-full" aria-label={T.detail.message}>{card.text}</pre>}
        </div>
        </div>

        <aside className="detail-side" aria-label={T.detail.properties}>
        <div className="props">
          <PropRow icon="flag" label={T.detail.status} id="detail-status-label">
            <StatusChip value={action} labelledBy="detail-status-label" onChange={(a) => props.onEdit({ action: a })} />
          </PropRow>
          <PropRow icon="folder" label={T.detail.topic} id="detail-topic-label">
            <button
              type="button"
              className={`prop-btn${topicAt ? " open" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={!!topicAt}
              aria-labelledby="detail-topic-label"
              onClick={(e) => setTopicAt(topicAt ? null : e.currentTarget)}
            >
              {topic ? <span className="topic-dot" style={{ "--h": hueOf(topic) } as React.CSSProperties} /> : null}
              <span className={topic ? "" : "placeholder"}>{topic || T.nav.noTopic}</span>
              <Icon name="down" size={11} className="chev" />
            </button>
            {topicAt && (
              <TopicMenu
                anchor={topicAt}
                matchAnchor
                topics={props.topics}
                current={topic || undefined}
                onPick={(t) => {
                  setTopic(t);
                  if (t !== (effectiveTopic(card) ?? "")) {
                    saved.current.topic = t; // so closing the panel doesn't write it again over a later move
                    props.onEdit({ topic: t });
                  }
                }}
                onClose={() => {
                  setTopicAt(null);
                  topicAt.focus();
                }}
              />
            )}
          </PropRow>
          <PropRow icon="hash" label={T.detail.tagsShort}>
            <TagsEditor
              tags={tags}
              onChange={(t) => {
                setTags(t);
                props.onEdit({ tags: t });
              }}
            />
          </PropRow>
          <PropRow icon="text" label={T.detail.note} id="detail-note-label">
            <NoteField value={note} labelledBy="detail-note-label" onChange={setNote} onSave={saveText} />
          </PropRow>
        </div>

        <div className="detail-foot">
          <span className="meta">
            {[
              new Date(card.date).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }),
              T.detail.messageId(card.id),
              card.forwardedFrom && T.detail.from(card.forwardedFrom),
              card.ai && T.detail.taggedBy(card.ai.model),
              card.sensitive && T.detail.notSentToAi,
              card.removed && T.detail.removed,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <button className="link-btn" onClick={() => props.onEdit({ hidden: !card.user?.hidden })}>
            {card.user?.hidden ? T.detail.show : T.detail.hide}
          </button>
        </div>
        </aside>
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
