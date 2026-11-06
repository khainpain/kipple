import { useState } from "react";
import { platform } from "@platform";
import type { Action, Card, Library, MediaRef, UserFields } from "../lib/types";
import { ACTIONS, actionLabel } from "../lib/types";
import { T, locale } from "../i18n";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { Icon } from "./Icon";
import { coverOf, displayTitle, siteOf } from "./CardView";
import { Preview } from "./Preview";
import { Gallery } from "./Gallery";
import { isImportant } from "../lib/smart";
import { OPEN_MODES, type OpenMode } from "./nav";

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
  const [title, setTitle] = useState(effectiveTitle(card));
  const [topic, setTopic] = useState(effectiveTopic(card) ?? "");
  const [tags, setTags] = useState(effectiveTags(card).join(", "));
  const [note, setNote] = useState(card.user?.note ?? "");
  const action = effectiveAction(card);
  const photos = card.kind === "photo" ? [card.media, ...(card.album ?? [])].filter((m): m is MediaRef => !!m?.path) : [];
  const cover = card.kind !== "photo" ? coverOf(lib, card).src : undefined;
  const site = siteOf(card);

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

  const panel = (
    <aside className={`detail-panel mode-${props.mode}`} aria-label={T.detail.label} onClick={(e) => e.stopPropagation()}>
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
          <Gallery lib={lib} items={photos} />
        )}
        {cover && <img className="detail-cover" src={cover} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
        {site && <div className="detail-site">{site}</div>}

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
        {card.ai?.summary && <p className="detail-summary">{card.ai.summary}</p>}

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
        <label className="field">
          <span>{T.detail.topic}</span>
          <input value={topic} list="topic-options" onChange={(e) => setTopic(e.target.value)} onBlur={saveText} />
          <datalist id="topic-options">
            {props.topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
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
