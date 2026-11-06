import { useState } from "react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import type { Action, Card, Library, UserFields } from "../lib/types";
import { ACTIONS, ACTION_LABELS } from "../lib/types";
import { joinPath, mediaUrl } from "../lib/importer";
import { effectiveAction, effectiveTags, effectiveTitle, effectiveTopic } from "../lib/library";

export function Detail(props: { lib: Library; card: Card; onClose: () => void; onEdit: (patch: UserFields) => void }) {
  const { card, lib } = props;
  const [title, setTitle] = useState(effectiveTitle(card));
  const [topic, setTopic] = useState(effectiveTopic(card) ?? "");
  const [tags, setTags] = useState(effectiveTags(card).join(", "));
  const action = effectiveAction(card);
  const photos = card.kind === "photo" ? [card.media, ...(card.album ?? [])].filter((m) => m?.path) : [];

  function saveText() {
    const patch: UserFields = {};
    if (title !== effectiveTitle(card)) patch.title = title.trim();
    if (topic !== (effectiveTopic(card) ?? "")) patch.topic = topic.trim();
    const t = tags.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (t.join(",") !== effectiveTags(card).join(",")) patch.tags = t;
    if (Object.keys(patch).length) props.onEdit(patch);
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
        {photos.length > 0 && (
          <div className="detail-photos">
            {photos.map((m) => (
              <img key={m!.path} src={mediaUrl(lib, m!.path)} alt="" />
            ))}
          </div>
        )}
        {card.media?.path && card.kind !== "photo" && (
          <button className="secondary" onClick={() => openPath(joinPath(lib.sourceDir, card.media!.path!))}>
            Открыть файл {card.media.fileName ?? ""}
          </button>
        )}
        <label>
          Заголовок
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} />
        </label>
        {card.ai?.summary && <p className="summary">{card.ai.summary}</p>}
        <div className="row">
          <label>
            Тема
            <input value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={saveText} />
          </label>
          <label>
            Теги через запятую
            <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveText} />
          </label>
        </div>
        <div className="actions">
          {ACTIONS.map((a: Action) => (
            <button key={a} className={`chip action-${a}${action === a ? " active" : ""}`} onClick={() => props.onEdit({ action: a })}>
              {ACTION_LABELS[a]}
            </button>
          ))}
          <button className="chip" onClick={() => props.onEdit({ hidden: !card.user?.hidden })}>
            {card.user?.hidden ? "Показать" : "Скрыть"}
          </button>
        </div>
        {card.urls.length > 0 && (
          <div className="links">
            {card.urls.map((u) => (
              <a key={u} href="#" onClick={(e) => (e.preventDefault(), openUrl(u))}>
                {u}
              </a>
            ))}
          </div>
        )}
        <pre className="orig-full">{card.text || "(без текста)"}</pre>
        <div className="meta">
          {new Date(card.date).toLocaleString("ru-RU")} · сообщение #{card.id}
          {card.forwardedFrom ? ` · из «${card.forwardedFrom}»` : ""}
          {card.ai ? ` · разметка ${card.ai.model}` : ""}
          {card.sensitive ? " · 🔒 не отправлялось в AI" : ""}
          {card.removed ? " · нет в последнем экспорте" : ""}
        </div>
      </div>
    </div>
  );
}
