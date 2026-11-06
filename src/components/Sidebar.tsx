import { useState } from "react";
import { Icon } from "./Icon";
import { SMART_LISTS, hueOf, sameScope, type Scope } from "./nav";

function Item(props: { icon?: string; dot?: number; label: string; count?: number; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button className={`side-item${props.active ? " active" : ""}`} onClick={props.onClick} title={props.title ?? props.label}>
      {props.dot !== undefined ? <span className="topic-dot" style={{ "--h": props.dot } as React.CSSProperties} /> : <Icon name={props.icon ?? "folder"} />}
      <span className="label">{props.label}</span>
      {props.count !== undefined && <small>{props.count}</small>}
    </button>
  );
}

function Section(props: { title: string; children: React.ReactNode; defaultOpen?: boolean; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className="side-section">
      <h4>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? "down" : "right"} size={12} />
          {props.title}
        </button>
        {props.extra}
      </h4>
      {open && props.children}
    </section>
  );
}

export function Sidebar(props: {
  chatName: string;
  scope: Scope;
  tag: string | null;
  listCounts: Record<string, number>;
  topics: Array<[string, number]>;
  noTopic: number;
  tags: Array<[string, number]>;
  onScope: (s: Scope) => void;
  onTag: (t: string | null) => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const is = (s: Scope) => sameScope(props.scope, s);
  const tags = showAllTags ? props.tags : props.tags.slice(0, 15);

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="logo">SB</span>
        <div>
          <strong>Saved Board</strong>
          <small>{props.chatName}</small>
        </div>
      </div>

      <nav className="side-group">
        {SMART_LISTS.map((l) => (
          <Item key={l.key} icon={l.icon} label={l.label} count={props.listCounts[l.key]} active={is({ kind: "list", key: l.key })} onClick={() => props.onScope({ kind: "list", key: l.key })} />
        ))}
      </nav>

      <Section title="Темы">
        {props.topics.map(([t, n]) => (
          <Item key={t} dot={hueOf(t)} label={t} count={n} active={is({ kind: "topic", name: t })} onClick={() => props.onScope({ kind: "topic", name: t })} />
        ))}
        {props.noTopic > 0 && <Item icon="inbox" label="Без темы" count={props.noTopic} active={is({ kind: "notopic" })} onClick={() => props.onScope({ kind: "notopic" })} />}
        {props.topics.length === 0 && <p className="hint side-hint">Темы появятся после AI-разметки.</p>}
      </Section>

      {props.tags.length > 0 && (
        <Section title="Теги">
          <div className="side-tags">
            {tags.map(([t, n]) => (
              <button key={t} className={`side-tag${props.tag === t ? " active" : ""}`} onClick={() => props.onTag(props.tag === t ? null : t)}>
                #{t} <small>{n}</small>
              </button>
            ))}
          </div>
          {props.tags.length > 15 && (
            <button className="link-btn" onClick={() => setShowAllTags(!showAllTags)}>
              {showAllTags ? "Свернуть" : `Ещё ${props.tags.length - 15}`}
            </button>
          )}
        </Section>
      )}

      <nav className="side-group bottom">
        {props.listCounts.sensitive > 0 && (
          <Item
            icon="lock"
            label="Чувствительное"
            count={props.listCounts.sensitive}
            active={is({ kind: "list", key: "sensitive" })}
            onClick={() => props.onScope({ kind: "list", key: "sensitive" })}
            title="Похоже на пароли, ключи, номера карт. Не отправляется в AI."
          />
        )}
        <Item icon="trash" label="Мусор" count={props.listCounts.junk} active={is({ kind: "list", key: "junk" })} onClick={() => props.onScope({ kind: "list", key: "junk" })} />
      </nav>
    </aside>
  );
}
