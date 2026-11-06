import { useEffect, useMemo, useState } from "react";
import type { TelegramApi } from "../platform/types";
import type { Card } from "../lib/types";
import { BOARD_TITLE, buildPlan, otherTopic, telegramErrorText, type BoardState, type SendOptions } from "../lib/telegram";
import { loadBoardState } from "../lib/store";
import { T } from "../i18n";

type Step = "loading" | "noApi" | "phone" | "code" | "password" | "ready";

/** Logs in to the user's Telegram account and starts sending the library to the "Saved Board" group. */
export function TelegramDialog(props: {
  tg: TelegramApi;
  cards: Card[];
  running: boolean;
  onStart: (opts: SendOptions) => void;
  /** Only for builds without a built-in Telegram key: the user's own key lives in Settings → Advanced. */
  onOpenSettings: () => void;
  onClose: () => void;
}) {
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

  async function refresh() {
    setError(null);
    try {
      const [s, b] = await Promise.all([tg.status(), loadBoardState()]);
      setState(b);
      setName(s.name ?? "");
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

  const L = T.telegram;

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings telegram" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label={T.common.close}>
          ×
        </button>
        <h2>{L.title}</h2>
        <p className="hint">
          {L.intro(BOARD_TITLE)}
        </p>

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
              <a href="#" onClick={(e) => (e.preventDefault(), void run(async () => (await tg.logout(), await refresh())))}>
                {L.signOut}
              </a>
            </p>
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
            <div className="dialog-buttons">
              <span className="spacer" />
              <button className="secondary" onClick={props.onClose}>
                {T.common.close}
              </button>
              <button disabled={busy || props.running || !plan.length} onClick={() => props.onStart(opts)}>
                {props.running ? L.sending : L.send(plan.length)}
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
