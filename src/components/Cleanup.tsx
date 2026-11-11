import { useEffect, useRef, useState } from "react";
import type { Card, Library, UserPatch } from "../lib/types";
import { decide, restore, takeBack, type Breakdown, type Decision, type Done, type Pile, type PileKind } from "../lib/cleanup";
import { getTopicRules } from "../lib/library";
import { track } from "../lib/telemetry";
import { T, formatNumber } from "../i18n";
import { coverOf, displayTitle } from "./CardView";
import { Icon } from "./Icon";
import { TopicMenu } from "./TopicMenu";
import { loadPref, savePref } from "./nav";
import mascot from "../../brand/kipple-mascot-light.svg";

/** What the screen remembers while the workspace is open, so a look at the board doesn't lose it. */
export interface CleanupSession {
  /** Piles set aside with "Later", by key. */
  later: string[];
  /** Decisions that can be taken back, the latest last, each with the pile it was about. */
  undo: (Done & { key: string })[];
}
export const NEW_SESSION: CleanupSession = { later: [], undo: [] };

const ICONS: Record<PileKind, string> = { junk: "trash", dupes: "copy", channel: "send", site: "globe", like: "folder", photos: "photo", videos: "video", files: "file", audio: "music", old: "clock", notes: "text", rest: "inbox" };
const SAMPLES = 4;
/** Two decisions closer together than this are one press that ran on. */
const DECIDE_GAP_MS = 400;

export function pileTitle(p: Pile): string {
  return p.kind === "channel" || p.kind === "site" || p.kind === "like" ? T.cleanup.pile[p.kind](p.name ?? "") : T.cleanup.pile[p.kind];
}

/**
 * One example from a pile: its picture when it has one, else its first line. Guessed junk is
 * hidden on the board until someone looks, so its examples are text and load no picture either.
 */
function Sample({ lib, card, plain }: { lib: Library; card: Card; plain: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = failed || plain ? undefined : coverOf(lib, card).src;
  if (src) return <img className="cl-thumb" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return <span className="cl-line">{displayTitle(card)}</span>;
}

/**
 * "First cleanup": the archive as piles, one decision per pile. Shown after the first load and
 * from the sidebar. Every decision is an edit inside Kipple that Undo or Ctrl+Z takes back;
 * nothing here reaches Telegram.
 */
export function Cleanup(props: {
  lib: Library;
  breakdown: Breakdown;
  topics: string[];
  session: CleanupSession;
  onSession: (s: CleanupSession) => void;
  onEdit: (ids: number[], patch: UserPatch) => void;
  /** Everything new from this channel or site goes to the topic too (library.ts TopicRules). */
  onRule: (kind: "channel" | "site", key: string, topic: string) => void;
  /** Opens the pile on the board. */
  onView: (pile: Pile) => void;
  onSensitive: () => void;
  onBoard: () => void;
  /** Undefined where junk can't be deleted in Telegram (the demo, the browser). */
  onApplyTelegram?: () => void;
}) {
  const { breakdown: b, session } = props;
  /** "To a topic" is open for this pile; the pile itself is looked up again when a topic is picked. */
  const [menu, setMenu] = useState<{ key: string; at: HTMLElement } | null>(null);
  /** What just happened, and whether it is a decision that Undo takes back. */
  const [note, setNote] = useState<{ text: string; undo: boolean; rule?: { kind: "channel" | "site"; key: string; topic: string } }>({ text: "", undo: false });
  /** Where the focus goes once the list has changed: the pile now at this place or with this key, else the summary. */
  const [focusAt, setFocusAt] = useState<number | string | null>(null);
  /** Nobody has decided anything on this screen yet: a few words on what it is, until the first decision. */
  const [fresh, setFresh] = useState(() => loadPref("cleanupIntro", ["new", "seen"], "new") === "new");
  const decidedAt = useRef(-DECIDE_GAP_MS);
  const list = useRef<HTMLUListElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);

  const active = b.piles.filter((p) => !session.later.includes(p.key));
  const later = b.piles.filter((p) => session.later.includes(p.key));
  const done = active.length === 0;
  const sortedTotal = b.sorted.kept + b.sorted.topics + b.sorted.junk;

  useEffect(() => track("cleanup_opened"), []);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) track("cleanup_finished");
    wasDone.current = done;
  }, [done]);

  // The decided pile is gone from the list: the keyboard carries on from the one that took its place.
  useEffect(() => {
    if (focusAt === null) return;
    const rows = list.current?.querySelectorAll<HTMLElement>(":scope > li") ?? [];
    const at = typeof focusAt === "number" ? Math.min(focusAt, rows.length - 1) : active.findIndex((p) => p.key === focusAt);
    const next = rows[at]?.querySelector<HTMLElement>("button");
    (next ?? summary.current)?.focus({ preventScroll: !next });
    setFocusAt(null);
  }, [focusAt]);

  function started() {
    if (!fresh) return;
    setFresh(false);
    savePref("cleanupIntro", "seen");
  }

  function act(pile: Pile, how: Decision, topic?: string) {
    // The next pile moves up under the pointer and takes the focus: a double click or a held Enter must not decide it too.
    if (performance.now() - decidedAt.current < DECIDE_GAP_MS) return;
    const edits = decide(pile, how, topic);
    const n = edits.reduce((sum, e) => sum + e.ids.length, 0);
    if (!n) return;
    decidedAt.current = performance.now();
    started();
    const back = restore(props.lib.cards, edits);
    for (const e of edits) props.onEdit(e.ids, e.patch);
    props.onSession({ ...session, undo: [...session.undo, { edits, back, key: pile.key }] });
    const c = T.cleanup;
    // A whole channel or site went to a topic: offer the same for what comes from there later.
    const kind = pile.kind === "channel" || pile.kind === "site" ? pile.kind : undefined;
    const rules = getTopicRules();
    const rule = how === "topic" && kind && pile.name && !Object.prototype.hasOwnProperty.call(kind === "channel" ? rules.channels : rules.sites, pile.name) ? { kind, key: pile.name, topic: topic!.trim() } : undefined;
    setNote({ text: how === "keep" ? c.kept(n) : how === "topic" ? c.moved(n, topic!.trim()) : how === "junk" ? c.junked(n) : c.extras(n), undo: true, rule });
    setFocusAt(active.findIndex((p) => p.key === pile.key));
    track("cleanup_decided", how === "keepOne" ? "keep_one" : how);
  }

  function undo() {
    const last = session.undo[session.undo.length - 1];
    if (!last) return;
    // Cards changed again since (on the board, after "View") keep that later choice.
    for (const e of takeBack(props.lib.cards, last)) props.onEdit(e.ids, e.patch);
    props.onSession({ ...session, undo: session.undo.slice(0, -1) });
    setNote({ text: T.cleanup.undone, undo: false });
    setFocusAt(last.key);
  }

  function setAside(pile: Pile) {
    started();
    props.onSession({ ...session, later: [...session.later, pile.key] });
    setNote({ text: "", undo: false });
    setFocusAt(active.indexOf(pile));
    track("cleanup_decided", "later");
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(T.cleanup.share(b.sorted.kept, b.sorted.topics, b.sorted.junk));
      setNote({ text: T.cleanup.copied, undo: false });
    } catch {
      setNote({ text: T.cleanup.copyFailed, undo: false });
    }
  }

  // Ctrl+Z takes the last decision back. Caught before the board's own shortcuts, so on this screen it
  // never undoes something on the board out of sight; a dialog on top, the topic menu or a field keeps its keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== "KeyZ") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.closest(".topic-menu") || document.querySelector(".modal-backdrop")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) undo(); // a held key takes back one decision, not all of them
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const c = T.cleanup;
  return (
    <div className="grid-scroll cleanup">
      <header className="cl-top">
        <div className="cl-title">
          <h2 tabIndex={-1} ref={summary}>
            {c.summary(b.total, b.since, sortedTotal)}
          </h2>
          {!done && (
            <button className="link-btn" onClick={props.onBoard}>
              {c.toBoard} <Icon name="right" size={13} />
            </button>
          )}
        </div>
        <p className="cl-safe">
          <Icon name="lock" size={14} /> {c.safe}
        </p>
      </header>

      {done && (
        <section className="cl-finale" aria-labelledby="cl-done">
          <img src={mascot} alt="" className="today-mascot" />
          <h2 id="cl-done">{later.length ? c.doneLaterTitle : c.doneTitle}</h2>
          {later.length > 0 && <p className="hint">{c.doneLaterHint}</p>}
          <div className="today-stats">
            <div>
              <b>{formatNumber(b.sorted.kept)}</b>
              <span>{c.statKept}</span>
            </div>
            <div>
              <b>{formatNumber(b.sorted.topics)}</b>
              <span>{c.statTopics}</span>
            </div>
            <div>
              <b>{formatNumber(b.sorted.junk)}</b>
              <span>{c.statJunk}</span>
            </div>
          </div>
          <div className="cl-finale-btns">
            <button onClick={props.onBoard}>{c.toBoard}</button>
            {props.onApplyTelegram && (
              <button className="secondary" onClick={() => (track("cleanup_apply"), props.onApplyTelegram!())}>
                {c.apply}
              </button>
            )}
            <button className="secondary" onClick={() => void copySummary()}>
              <Icon name="copy" size={14} /> {c.copy}
            </button>
          </div>
        </section>
      )}

      {fresh && !done && (
        <div className="cl-intro">
          <img src={mascot} alt="" className="today-mascot" />
          <div>
            <h3>{c.introTitle}</h3>
            <p>{c.intro}</p>
          </div>
        </div>
      )}

      <ul className="cl-piles" ref={list}>
        {active.map((p) => {
          const title = pileTitle(p);
          const hint = p.kind in c.hint ? c.hint[p.kind as keyof typeof c.hint] : "";
          return (
            <li key={p.key} className="cl-pile">
              <span className={`today-icon${p.kind === "junk" || p.kind === "dupes" ? " dupes" : ""}`}>
                <Icon name={ICONS[p.kind]} size={16} />
              </span>
              <div className="cl-main">
                <div className="cl-head">
                  <h3 title={title}>{title}</h3>
                  <small>{formatNumber(p.cards.length)}</small>
                </div>
                {hint && <p className="hint">{hint}</p>}
              </div>
              <div className="cl-actions" role="group" aria-label={title}>
                {p.kind === "dupes" && (
                  <button className="small-btn" onClick={() => act(p, "keepOne")}>
                    {c.keepOne}
                  </button>
                )}
                {p.kind === "junk" && (
                  <button className="small-btn" onClick={() => act(p, "junk")}>
                    {c.toJunk}
                  </button>
                )}
                {p.kind !== "dupes" && (
                  <button className="secondary small-btn" onClick={() => act(p, "keep")}>
                    {c.keep}
                  </button>
                )}
                {/* After "Keep": the focus lands on a pile's first button, and a bulk move shouldn't be one Enter away. */}
                {p.kind === "like" && p.name && (
                  <button className="small-btn cl-to-that" title={c.toThat(p.name)} onClick={() => act(p, "topic", p.name)}>
                    {c.toThat(p.name)}
                  </button>
                )}
                {p.kind !== "dupes" && p.kind !== "junk" && (
                  <button className="secondary small-btn" aria-expanded={menu?.key === p.key} onClick={(e) => setMenu(menu?.key === p.key ? null : { key: p.key, at: e.currentTarget })}>
                    {c.toTopic}
                  </button>
                )}
                {/* A mixed remainder is decided card by card on the board, and a look-alike pile is wanted, not junk. */}
                {p.kind !== "dupes" && p.kind !== "junk" && p.kind !== "rest" && p.kind !== "like" && (
                  <button className="secondary small-btn" onClick={() => act(p, "junk")}>
                    {c.toJunk}
                  </button>
                )}
                <button className="secondary small-btn" onClick={() => (track("cleanup_decided", "view"), props.onView(p))}>
                  {c.view}
                </button>
                <button className="link-btn cl-later" onClick={() => setAside(p)}>
                  {c.later}
                </button>
              </div>
              <div className="cl-samples" aria-hidden="true">
                {p.cards.slice(0, SAMPLES).map((card) => (
                  <Sample key={card.id} lib={props.lib} card={card} plain={p.kind === "junk"} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {menu && (
        <TopicMenu
          anchor={menu.at}
          topics={props.topics}
          onPick={(t) => {
            const pile = active.find((p) => p.key === menu.key);
            if (pile) act(pile, "topic", t);
          }}
          onClose={() => {
            setMenu(null);
            // The keyboard is back on the button (without scrolling: the menu also closes when the list is scrolled).
            // After a pick the pile leaves the list and the focus moves on from there.
            menu.at.focus({ preventScroll: true });
          }}
        />
      )}

      {b.sensitive > 0 && (
        <p className="hint cl-sensitive">
          {c.sensitive(b.sensitive)}{" "}
          <button className="link-btn" onClick={props.onSensitive}>
            {c.view}
          </button>
        </p>
      )}

      {later.length > 0 && (
        <section className="cl-later-list" aria-labelledby="cl-later">
          <h3 id="cl-later">{c.laterTitle(later.length)}</h3>
          <ul>
            {later.map((p) => (
              <li key={p.key}>
                <Icon name={ICONS[p.kind]} size={14} />
                <span className="label">{pileTitle(p)}</span>
                <small>{formatNumber(p.cards.length)}</small>
                <button className="link-btn" onClick={() => (props.onSession({ ...session, later: session.later.filter((k) => k !== p.key) }), setNote({ text: "", undo: false }), setFocusAt(p.key))}>
                  {c.bringBack}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`cl-note${note.text ? " on" : ""}`}>
        <span role="status">{note.text}</span>
        {note.undo && session.undo.length > 0 && (
          <button className="link-btn" onClick={undo}>
            {c.undo} <kbd>Ctrl+Z</kbd>
          </button>
        )}
        {note.rule && (
          <button className="link-btn" onClick={() => (props.onRule(note.rule!.kind, note.rule!.key, note.rule!.topic), setNote({ text: T.rules.added, undo: false }))}>
            {T.rules.alsoNew}
          </button>
        )}
      </div>
    </div>
  );
}
