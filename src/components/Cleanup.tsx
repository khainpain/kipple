import { useEffect, useRef, useState } from "react";
import type { Card, Library, UserPatch } from "../lib/types";
import { decide, restore, type Breakdown, type Decision, type Pile, type PileEdit, type PileKind } from "../lib/cleanup";
import { track } from "../lib/telemetry";
import { T, formatNumber } from "../i18n";
import { coverOf, displayTitle } from "./CardView";
import { Icon } from "./Icon";
import { TopicMenu } from "./TopicMenu";
import mascot from "../../brand/kipple-mascot-light.svg";

/** What the screen remembers while the workspace is open, so a look at the board doesn't lose it. */
export interface CleanupSession {
  /** Piles set aside with "Later", by key. */
  later: string[];
  /** Decisions that can be taken back, the latest last: the edits that restore what each one changed. */
  undo: PileEdit[][];
}
export const NEW_SESSION: CleanupSession = { later: [], undo: [] };

const ICONS: Record<PileKind, string> = { junk: "trash", dupes: "copy", channel: "send", site: "globe", photos: "photo", videos: "video", files: "file", audio: "music", old: "clock", notes: "text", rest: "inbox" };
const SAMPLES = 4;

export function pileTitle(p: Pile): string {
  return p.kind === "channel" || p.kind === "site" ? T.cleanup.pile[p.kind](p.name ?? "") : T.cleanup.pile[p.kind];
}

/** One example from a pile: its picture when it has one, else its first line. */
function Sample({ lib, card }: { lib: Library; card: Card }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : coverOf(lib, card).src;
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
  /** Opens the pile on the board. */
  onView: (pile: Pile) => void;
  onSensitive: () => void;
  onBoard: () => void;
  /** Undefined where junk can't be deleted in Telegram (the demo, the browser). */
  onApplyTelegram?: () => void;
}) {
  const { breakdown: b, session } = props;
  const [menu, setMenu] = useState<{ pile: Pile; at: HTMLElement } | null>(null);
  const [note, setNote] = useState("");
  /** Where the focus goes once the list has changed: the pile now at this place, or the summary. */
  const [focusAt, setFocusAt] = useState<number | null>(null);
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
    const next = rows[Math.min(focusAt, rows.length - 1)]?.querySelector<HTMLElement>("button");
    (next ?? summary.current)?.focus({ preventScroll: !next });
    setFocusAt(null);
  }, [focusAt]);

  function act(pile: Pile, how: Decision, topic?: string) {
    const edits = decide(pile, how, topic);
    const n = edits.reduce((sum, e) => sum + e.ids.length, 0);
    if (!n) return;
    const back = restore(props.lib.cards, edits);
    for (const e of edits) props.onEdit(e.ids, e.patch);
    props.onSession({ ...session, undo: [...session.undo, back] });
    const c = T.cleanup;
    setNote(how === "keep" ? c.kept(n) : how === "topic" ? c.moved(n, topic!.trim()) : how === "junk" ? c.junked(n) : c.extras(n));
    setFocusAt(active.indexOf(pile));
    track("cleanup_decided", how === "keepOne" ? "keep_one" : how);
  }

  function undo() {
    const last = session.undo[session.undo.length - 1];
    if (!last) return;
    for (const e of last) props.onEdit(e.ids, e.patch);
    props.onSession({ ...session, undo: session.undo.slice(0, -1) });
    setNote(T.cleanup.undone);
  }

  function setAside(pile: Pile) {
    props.onSession({ ...session, later: [...session.later, pile.key] });
    setNote("");
    setFocusAt(active.indexOf(pile));
    track("cleanup_decided", "later");
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(T.cleanup.share(b.sorted.kept, b.sorted.topics, b.sorted.junk));
      setNote(T.cleanup.copied);
    } catch {
      setNote(T.cleanup.copyFailed);
    }
  }

  // Ctrl+Z takes the last decision back. Caught before the board's own shortcuts; a dialog on top
  // or a text field keeps its keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== "KeyZ" || !session.undo.length) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || document.querySelector(".modal-backdrop")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      undo();
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
        {b.sensitive > 0 && (
          <p className="hint">
            {c.sensitive(b.sensitive)}{" "}
            <button className="link-btn" onClick={props.onSensitive}>
              {c.view}
            </button>
          </p>
        )}
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
                {p.kind !== "dupes" && p.kind !== "junk" && (
                  <button className="secondary small-btn" aria-haspopup="dialog" aria-expanded={menu?.pile.key === p.key} onClick={(e) => setMenu(menu?.pile.key === p.key ? null : { pile: p, at: e.currentTarget })}>
                    {c.toTopic}
                  </button>
                )}
                {/* A mixed remainder is decided card by card on the board, not thrown out in one go. */}
                {p.kind !== "dupes" && p.kind !== "junk" && p.kind !== "rest" && (
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
                  <Sample key={card.id} lib={props.lib} card={card} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {menu && <TopicMenu anchor={menu.at} topics={props.topics} onPick={(t) => act(menu.pile, "topic", t)} onClose={() => setMenu(null)} />}

      {later.length > 0 && (
        <section className="cl-later-list" aria-labelledby="cl-later">
          <h3 id="cl-later">{c.laterTitle(later.length)}</h3>
          <ul>
            {later.map((p) => (
              <li key={p.key}>
                <Icon name={ICONS[p.kind]} size={14} />
                <span className="label">{pileTitle(p)}</span>
                <small>{formatNumber(p.cards.length)}</small>
                <button className="link-btn" onClick={() => props.onSession({ ...session, later: session.later.filter((k) => k !== p.key) })}>
                  {c.bringBack}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`cl-note${note ? " on" : ""}`} role="status">
        {note && <span>{note}</span>}
        {note && session.undo.length > 0 && (
          <button className="link-btn" onClick={undo}>
            {c.undo} <kbd>Ctrl+Z</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
