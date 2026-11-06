import { useEffect, useMemo, useState } from "react";
import { platform } from "@platform";
import type { TelegramApi, TelegramStatus } from "../platform/types";
import type { Card } from "../lib/types";
import { BOARD_TITLE, buildPlan, otherTopic, telegramErrorText, type BoardState, type SendOptions } from "../lib/telegram";
import { loadBoardState } from "../lib/store";
import { T } from "../i18n";

type Step = "loading" | "api" | "phone" | "code" | "password" | "ready";

/** Logs in to the user's Telegram account and starts sending the library to the "Saved Board" group. */
export function TelegramDialog(props: { tg: TelegramApi; cards: Card[]; running: boolean; onStart: (opts: SendOptions) => void; onClose: () => void }) {
  const { tg } = props;
  const [step, setStep] = useState<Step>("loading");
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [state, setState] = useState<BoardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [opts, setOpts] = useState<SendOptions>({ includeJunk: false, includeSensitive: false });
  const [showApi, setShowApi] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const [s, b] = await Promise.all([tg.status(), loadBoardState()]);
      setStatus(s);
      setState(b);
      setName(s.name ?? "");
      setStep(!s.hasApi ? "api" : s.authorized ? "ready" : "phone");
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

  const link = (url: string, text: string) => (
    <a href="#" onClick={(e) => (e.preventDefault(), platform.openUrl(url))}>
      {text}
    </a>
  );

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

        {(step === "api" || showApi) && (
          <form
            className="tg-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await tg.setApi(apiId, apiHash);
                setShowApi(false);
                await refresh();
              });
            }}
          >
            <p>
              {L.apiIntro1}
              {link("https://my.telegram.org/apps", "my.telegram.org")}
              {L.apiIntro2}
              <b>api_id</b>
              {L.apiIntro3}
              <b>api_hash</b>.
            </p>
            <div className="row">
              <label>
                api_id
                <input inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="1234567" />
              </label>
              <label>
                api_hash
                <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder={L.apiHashPlaceholder} />
              </label>
            </div>
            <div className="dialog-buttons">
              <span className="spacer" />
              {showApi && (
                <button type="button" className="secondary" onClick={() => setShowApi(false)}>
                  {T.common.cancel}
                </button>
              )}
              <button disabled={busy || !apiId.trim() || !apiHash.trim()}>{T.common.save}</button>
            </div>
          </form>
        )}

        {step === "phone" && !showApi && (
          <form className="tg-form" onSubmit={(e) => (e.preventDefault(), void run(async () => (await tg.requestCode(phone), setStep("code"))))}>
            <label>
              {L.phone}
              <input type="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={L.phonePlaceholder} />
            </label>
            <div className="dialog-buttons">
              {!status?.builtInApi && (
                <button type="button" className="secondary" onClick={() => setShowApi(true)}>
                  {L.changeApi}
                </button>
              )}
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

        {step === "ready" && !showApi && (
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
