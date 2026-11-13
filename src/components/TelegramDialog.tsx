import { useEffect, useMemo, useState } from "react";
import type { TelegramApi } from "../platform/types";
import type { Card } from "../lib/types";
import { BOARD_TITLE, buildPlan, otherTopic, telegramErrorText, type BoardState, type SendOptions } from "../lib/telegram";
import { loadBoardState, loadPinState, loadTagSyncState } from "../lib/store";
import { deletePlan, deleteWithFiles, pinPlan, type ApplyOptions, type PinState } from "../lib/tgApply";
import { HoldToConfirm } from "./Motion";
import { hashtagPlan, MAX_TG_TAGS, tagPlan, TAGS_PER_MESSAGE, likelyUsable, type TagMode, type TagSyncState } from "../lib/tgTags";
import { FEATURES } from "../lib/features";
import { T } from "../i18n";
import { useEscape } from "./useEscape";

type Step = "loading" | "noApi" | "phone" | "code" | "password" | "ready";

/**
 * Signs in to the user's Telegram account and carries what was sorted out in Kipple to it:
 * junk deleted and important pinned, tags, and the "Kipple" group with topics.
 */
export function TelegramDialog(props: {
  tg: TelegramApi;
  cards: Card[];
  running: boolean;
  onStart: (opts: SendOptions) => void;
  /** Tags are being copied to Saved Messages right now. */
  syncingTags: boolean;
  /** Something else is running (AI tagging, loading): starting now would stop it. */
  otherJob: boolean;
  onSyncTags: (mode: TagMode) => void;
  /** Junk is being deleted / important pinned right now. */
  applying: boolean;
  onApply: (opts: ApplyOptions) => void;
  /** Only for builds without a built-in Telegram key: the user's own key lives in Settings → Advanced. */
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  useEscape(props.onClose);
  const { tg } = props;
  const [step, setStep] = useState<Step>("loading");
  const [state, setState] = useState<BoardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [opts, setOpts] = useState<SendOptions>({ includeJunk: false, includeSensitive: false });
  const [premium, setPremium] = useState(false);
  const [tagState, setTagState] = useState<TagSyncState | null>(null);
  const [tagMode, setTagMode] = useState<TagMode | null>(null);
  const [pinState, setPinState] = useState<PinState | null>(null);
  const [apply, setApply] = useState<ApplyOptions>({ deleteJunk: true, pins: true });

  async function refresh() {
    setError(null);
    try {
      const [s, b, t, p] = await Promise.all([tg.status(), loadBoardState(), loadTagSyncState(), loadPinState()]);
      setState(b);
      setTagState(t);
      setPinState(p);
      setName(s.name ?? "");
      setPremium(!!s.premium);
      setStep(!s.hasApi ? "noApi" : s.authorized ? "ready" : "phone");
    } catch (e) {
      setError(telegramErrorText(e));
      setStep("phone");
    }
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(telegramErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const plan = useMemo(() => (state ? buildPlan(props.cards, state, opts) : []), [props.cards, state, opts]);
  const sentCount = state ? Object.keys(state.sent).length : 0;
  const topicCount = new Set(plan.map((p) => p.topic)).size;
  const minutes = Math.max(1, Math.round((plan.length * 2.5) / 60));
  const untagged = useMemo(() => {
    const ids = new Set(plan.map((p) => p.cardId));
    return props.cards.filter((c) => ids.has(c.id) && !c.ai && !c.user?.topic).length;
  }, [plan, props.cards]);

  // Without Premium only hashtags are possible; with it, Telegram's own tags are the natural pick.
  const mode: TagMode = premium ? (tagMode ?? "tags") : "hashtags";
  const tagCount = useMemo(() => {
    if (!tagState) return 0;
    return (mode === "tags" ? tagPlan(props.cards, tagState, likelyUsable(props.cards, tagState)) : hashtagPlan(props.cards, tagState)).length;
  }, [props.cards, tagState, mode]);

  const junkCount = useMemo(() => deletePlan(props.cards).length, [props.cards]);
  const junkFiles = useMemo(() => deleteWithFiles(props.cards), [props.cards]);
  const pins = useMemo(() => (pinState ? pinPlan(props.cards, pinState) : []), [props.cards, pinState]);
  const pinCount = pins.filter((p) => p.pin).length;
  const toDelete = apply.deleteJunk && junkCount > 0;
  const applyCount = (apply.deleteJunk ? junkCount : 0) + (apply.pins ? pins.length : 0);
  const applyBlocked = busy || props.running || props.syncingTags || props.applying || props.otherJob || !applyCount;

  const L = T.telegram;

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings telegram" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label={T.common.close}>
          ×
        </button>
        <h2>{L.title}</h2>
        <p className="hint">{L.applyIntro}</p>

        {step === "loading" && <p className="hint">{L.checking}</p>}

        {step === "noApi" && (
          <>
            <p>{L.noApi}</p>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button onClick={props.onOpenSettings}>{L.openSettings}</button>
            </div>
          </>
        )}

        {step === "phone" && (
          <form className="tg-form" onSubmit={(e) => (e.preventDefault(), void run(async () => (await tg.requestCode(phone), setStep("code"))))}>
            <label>
              {L.phone}
              <input type="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={L.phonePlaceholder} />
            </label>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button disabled={busy || !phone.trim()}>{L.getCode}</button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form
            className="tg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await tg.signIn(code);
                if (r.status === "password") {
                  setHint(r.hint ?? null);
                  setStep("password");
                } else {
                  setName(r.name);
                  await refresh();
                }
              });
            }}
          >
            <label>
              {L.code}
              <input inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
            </label>
            <div className="dialog-buttons">
              <button type="button" className="secondary" onClick={() => (setCode(""), setStep("phone"))}>
                {L.otherPhone}
              </button>
              <span className="spacer" />
              <button disabled={busy || !code.trim()}>{L.signIn}</button>
            </div>
          </form>
        )}

        {step === "password" && (
          <form
            className="tg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await tg.checkPassword(password);
                if (r.status === "ok") setName(r.name);
                await refresh();
              });
            }}
          >
            <label>
              {L.password}{hint ? L.passwordHint(hint) : ""}
              <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button disabled={busy || !password}>{L.signIn}</button>
            </div>
          </form>
        )}

        {step === "ready" && (
          <>
            <p>
              {L.signedIn}{name ? <>: <b>{name}</b></> : ""}.{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), void run(async () => {
                    // Signed out here even if Telegram didn't answer; the error (if any) still shows.
                    try {
                      await tg.logout();
                    } finally {
                      await refresh();
                    }
                  }))}>
                {L.signOut}
              </a>
            </p>

            <h3>{L.cleanTitle}</h3>
            <label className="check">
              <input type="checkbox" disabled={!junkCount} checked={apply.deleteJunk && !!junkCount} onChange={(e) => setApply({ ...apply, deleteJunk: e.target.checked })} />
              {L.deleteJunk(junkCount)}
            </label>
            <p className="hint">
              {L.deleteJunkHint}
              {apply.deleteJunk && junkFiles > 0 && <> <strong>{L.deleteJunkFiles(junkFiles)}</strong></>}
            </p>
            <label className="check">
              <input type="checkbox" disabled={!pins.length} checked={apply.pins && !!pins.length} onChange={(e) => setApply({ ...apply, pins: e.target.checked })} />
              {L.pinImportant(pinCount, pins.length - pinCount)}
            </label>
            <p className="hint">
              {L.pinImportantHint}
              {!junkCount && !pins.length && <> {L.applyNothing}</>}
            </p>
            <div className="dialog-buttons">
              <span className="spacer" />
              {/* Deleting can't be undone in Telegram: hold to confirm. */}
              {toDelete ? (
                <HoldToConfirm disabled={applyBlocked} doneLabel={L.applyHoldDone} onHold={() => props.onApply(apply)}>
                  {L.applyHold}
                </HoldToConfirm>
              ) : (
                <button disabled={applyBlocked} onClick={() => props.onApply(apply)}>
                  {props.applying ? L.applyRunning : L.apply}
                </button>
              )}
            </div>

            {FEATURES.tags && (
              <>
            <h3 id="tg-tags-title">{L.tagsTitle}</h3>
            <p className="hint">{L.tagsIntro}</p>
            <fieldset className="tg-tag-mode" aria-labelledby="tg-tags-title">
              <label className="check">
                <input type="radio" name="tg-tag-mode" disabled={!premium} checked={mode === "tags"} onChange={() => setTagMode("tags")} />
                <span>
                  <b>{L.tagsModeTags}</b> · {premium ? L.tagsModeTagsHint(MAX_TG_TAGS, TAGS_PER_MESSAGE) : L.tagsNoPremium}
                </span>
              </label>
              <label className="check">
                <input type="radio" name="tg-tag-mode" checked={mode === "hashtags"} onChange={() => setTagMode("hashtags")} />
                <span>
                  <b>{L.tagsModeHashtags}</b> · {L.tagsModeHashtagsHint}
                </span>
              </label>
            </fieldset>
            <p className="hint">{tagCount ? L.tagsPlan(tagCount) : L.tagsNothing}</p>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button disabled={busy || props.running || props.syncingTags || props.applying || props.otherJob || !tagCount} onClick={() => props.onSyncTags(mode)}>
                {props.syncingTags ? L.tagsRunning : L.tagsStart}
              </button>
            </div>
              </>
            )}

            {FEATURES.forumSend && (
              <>
            <h3>{L.boardTitle(BOARD_TITLE)}</h3>
            <p className="hint">{L.intro(BOARD_TITLE)}</p>
            <label className="check">
              <input type="checkbox" checked={opts.includeJunk} onChange={(e) => setOpts({ ...opts, includeJunk: e.target.checked })} />
              {L.includeJunk}
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.includeSensitive} onChange={(e) => setOpts({ ...opts, includeSensitive: e.target.checked })} />
              {L.includeSensitive}
            </label>
            <p className="hint">
              {plan.length
                ? L.plan(plan.length, topicCount, minutes)
                : L.allSent}
              {sentCount > 0 && L.alreadySent(sentCount)}
              {untagged > 0 && L.untagged(untagged, otherTopic(state ?? undefined))}
            </p>
              </>
            )}
            <div className="dialog-buttons">
              <span className="spacer" />
              <button className="secondary" onClick={props.onClose}>
                {T.common.close}
              </button>
              {FEATURES.forumSend && (
                <button disabled={busy || props.running || props.applying || !plan.length} onClick={() => props.onStart(opts)}>
                  {props.running ? L.sending : L.send(plan.length)}
                </button>
              )}
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
