import { useState } from "react";
import { platform } from "@platform";
import type { Action, Card, Library, UserFields } from "../lib/types";
import { ACTIONS, ACTION_LABELS } from "../lib/types";
import { mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";
import { Icon } from "./Icon";
import { coverOf, siteOf } from "./CardView";

/** Right-hand panel with the full card: stays next to the board, arrow keys step through cards. */
export function Detail(props: {
  lib: Library;
  card: Card;
  topics: string[];
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
  const photos = card.kind === "photo" ? [card.media, ...(card.album ?? [])].filter((m) => m?.path) : [];
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

  return (
    <aside className="detail-panel" aria-label="Карточка">
      <header className="detail-head">
        <button className="icon-btn" onClick={props.onPrev} disabled={!props.onPrev} title="Предыдущая (↑)">
          <Icon name="up" />
        </button>
        <button className="icon-btn" onClick={props.onNext} disabled={!props.onNext} title="Следующая (↓)">
          <Icon name="down" />
        </button>
        <span className="spacer" />
        {card.urls[0] && (
          <button className="secondary small-btn" onClick={() => platform.openUrl(card.urls[0])}>
            <Icon name="external" size={14} /> Открыть
          </button>
        )}
        <button className="icon-btn" onClick={props.onClose} title="Закрыть (Esc)" aria-label="Закрыть">
          <Icon name="close" />
        </button>
      </header>

      <div className="detail-scroll">
        {photos.length > 0 && (
          <div className="detail-photos">
            {photos.map((m) => (
              <img key={m!.path} src={mediaUrl(lib, m!.path)} alt="" />
            ))}
          </div>
        )}
        {cover && <img className="detail-cover" src={cover} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
        {site && <div className="detail-site">{site}</div>}

        <textarea className="detail-title" rows={1} value={title} placeholder="Заголовок" onChange={(e) => setTitle(e.target.value)} onBlur={saveText} />
        {card.ai?.summary && <p className="detail-summary">{card.ai.summary}</p>}

        {card.media?.path && card.kind !== "photo" && (
          <button className="secondary" onClick={() => platform.openFile(lib.sourceDir, card.media!.path!)}>
            <Icon name="file" size={14} /> Открыть файл {card.media.fileName ?? ""}
          </button>
        )}

        <div className="field">
          <span>Статус</span>
          <div className="actions">
            {ACTIONS.map((a: Action) => (
              <button key={a} className={`pill action-${a}${action === a ? " on" : ""}`} onClick={() => props.onEdit({ action: a })}>
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Тема</span>
          <input value={topic} list="topic-options" onChange={(e) => setTopic(e.target.value)} onBlur={saveText} />
          <datalist id="topic-options">
            {props.topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Теги через запятую</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveText} />
        </label>
        <label className="field">
          <span>Заметка</span>
          <textarea rows={2} value={note} placeholder="Зачем сохранил, что сделать…" onChange={(e) => setNote(e.target.value)} onBlur={saveText} />
        </label>

        {card.urls.length > 0 && (
          <div className="field">
            <span>Ссылки</span>
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
          <span>Сообщение</span>
          <pre className="orig-full">{card.text || "(без текста)"}</pre>
        </div>
        <div className="meta">
          {new Date(card.date).toLocaleString("ru-RU")} · сообщение #{card.id}
          {card.forwardedFrom ? ` · из «${card.forwardedFrom}»` : ""}
          {card.ai ? ` · разметка ${card.ai.model}` : ""}
          {card.sensitive ? " · не отправлялось в AI" : ""}
          {card.removed ? " · нет в последнем экспорте" : ""}
        </div>
        <button className="link-btn" onClick={() => props.onEdit({ hidden: !card.user?.hidden })}>
          {card.user?.hidden ? "Показать в ленте" : "Скрыть из ленты"}
        </button>
      </div>
    </aside>
  );
}
