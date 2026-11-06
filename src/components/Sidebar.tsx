import { useEffect, useState } from "react";
import type { TelegramAccount } from "../platform/types";
import logoLight from "../../brand/kipple-icon-tiny-light.svg";
import logoDark from "../../brand/kipple-icon-tiny-dark.svg";
import { Icon } from "./Icon";
import { T, formatNumber } from "../i18n";
import { SMART_LISTS, hueOf, sameScope, type Scope } from "./nav";

const TOPICS_SHOWN = 10;
const TAGS_SHOWN = 12;

function Item(props: { icon?: string; dot?: number; label: string; count?: number; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button className={`side-item${props.active ? " active" : ""}`} onClick={props.onClick} title={props.title ?? props.label}>
      {props.dot !== undefined ? <span className="topic-dot" style={{ "--h": props.dot } as React.CSSProperties} /> : <Icon name={props.icon ?? "folder"} />}
      <span className="label">{props.label}</span>
      {props.count !== undefined && <small>{formatNumber(props.count)}</small>}
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

/** Object URL for the avatar bytes, revoked when they change. */
function usePhotoUrl(photo?: number[] | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo?.length) return setUrl(null);
    const u = URL.createObjectURL(new Blob([new Uint8Array(photo)], { type: "image/jpeg" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return url;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0])
      .join("")
      .toUpperCase() || "?"
  );
}

/** The signed-in Telegram account when there is one, otherwise the app name and the library's source. */
function Brand(props: { chatName: string; account?: TelegramAccount | null }) {
  const { account } = props;
  const photo = usePhotoUrl(account?.photo);
  if (!account) {
    return (
      <div className="side-brand">
        <span className="logo">
          <img className="only-light" src={logoLight} alt="" />
          <img className="only-dark" src={logoDark} alt="" />
        </span>
        <div>
          <strong>Kipple</strong>
          <small>{props.chatName}</small>
        </div>
      </div>
    );
  }
  return (
    <div className="side-brand" title={T.sidebar.signedIn}>
      <span className="avatar">{photo ? <img src={photo} alt="" /> : initials(account.name)}</span>
      <div>
        <strong>{account.name}</strong>
        <small>{account.username ? `@${account.username}` : props.chatName}</small>
      </div>
    </div>
  );
}

export function Sidebar(props: {
  chatName: string;
  account?: TelegramAccount | null;
  scope: Scope;
  tag: string | null;
  listCounts: Record<string, number>;
  topics: Array<[string, number]>;
  noTopic: number;
  tags: Array<[string, number]>;
  onScope: (s: Scope) => void;
  onTag: (t: string | null) => void;
  tidyCount: number;
  onTidy: () => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const is = (s: Scope) => sameScope(props.scope, s);
  // Topics are the shelves: the biggest few, the rest one click away. The open one always shows.
  const topics = showAllTopics ? props.topics : props.topics.filter(([t], i) => i < TOPICS_SHOWN || is({ kind: "topic", name: t }));
  // Tags are fine filters: only the common ones by default; tags on a single card wait under "more".
  const shortTags = props.tags.filter(([t, n], i) => (i < TAGS_SHOWN && n > 1) || t === props.tag);
  const tags = showAllTags ? props.tags : shortTags;
  const tidyBtn = (
    <button className={`icon-btn side-tidy${props.tidyCount ? " has" : ""}`} onClick={props.onTidy} title={props.tidyCount ? `${T.tidy.open} · ${T.tidy.found(props.tidyCount)}` : T.tidy.open}>
      <Icon name="merge" size={14} />
    </button>
  );

  return (
    <aside className="sidebar">
      <Brand chatName={props.chatName} account={props.account} />

      <nav className="side-group">
        <Item icon="home" label={T.nav.home} active={is({ kind: "home" })} onClick={() => props.onScope({ kind: "home" })} />
        {SMART_LISTS.map((l) => (
          <Item key={l.key} icon={l.icon} label={l.label} count={props.listCounts[l.key]} active={is({ kind: "list", key: l.key })} onClick={() => props.onScope({ kind: "list", key: l.key })} />
        ))}
      </nav>

      <Section title={T.sidebar.topics} extra={props.topics.length > 1 ? tidyBtn : undefined}>
        {topics.map(([t, n]) => (
          <Item key={t} dot={hueOf(t)} label={t} count={n} active={is({ kind: "topic", name: t })} onClick={() => props.onScope({ kind: "topic", name: t })} />
        ))}
        {props.noTopic > 0 && <Item icon="inbox" label={T.nav.noTopic} count={props.noTopic} active={is({ kind: "notopic" })} onClick={() => props.onScope({ kind: "notopic" })} />}
        {props.topics.length > TOPICS_SHOWN && (
          <button className="link-btn side-more" onClick={() => setShowAllTopics(!showAllTopics)}>
            {showAllTopics ? T.sidebar.collapse : T.sidebar.more(props.topics.length - topics.length)}
          </button>
        )}
        {props.topics.length === 0 && <p className="hint side-hint">{T.sidebar.topicsHint}</p>}
      </Section>

      {props.tags.length > 0 && (
        <Section title={T.sidebar.tags} extra={props.topics.length > 1 ? undefined : tidyBtn}>
          <div className="side-tags">
            {tags.map(([t, n]) => (
              <button key={t} className={`side-tag${props.tag === t ? " active" : ""}`} onClick={() => props.onTag(props.tag === t ? null : t)}>
                #{t} <small>{formatNumber(n)}</small>
              </button>
            ))}
          </div>
          {props.tags.length > shortTags.length && (
            <button className="link-btn side-more" onClick={() => setShowAllTags(!showAllTags)}>
              {showAllTags ? T.sidebar.collapse : T.sidebar.more(props.tags.length - shortTags.length)}
            </button>
          )}
        </Section>
      )}

      <nav className="side-group bottom">
        {props.listCounts.sensitive > 0 && (
          <Item
            icon="lock"
            label={T.nav.sensitive}
            count={props.listCounts.sensitive}
            active={is({ kind: "list", key: "sensitive" })}
            onClick={() => props.onScope({ kind: "list", key: "sensitive" })}
            title={T.sidebar.sensitiveHint}
          />
        )}
        {props.listCounts.duplicates > 0 && (
          <Item
            icon="copy"
            label={T.nav.duplicates}
            count={props.listCounts.duplicates}
            active={is({ kind: "list", key: "duplicates" })}
            onClick={() => props.onScope({ kind: "list", key: "duplicates" })}
          />
        )}
        <Item icon="trash" label={T.nav.junk} count={props.listCounts.junk} active={is({ kind: "list", key: "junk" })} onClick={() => props.onScope({ kind: "list", key: "junk" })} />
      </nav>
    </aside>
  );
}
