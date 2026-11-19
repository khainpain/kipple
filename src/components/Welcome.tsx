import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { QrResult, TelegramApi } from "../platform/types";
import { telegramErrorText } from "../lib/telegram";
import { track } from "../lib/telemetry";
import { qrPath } from "../lib/qr";
import { cleanCode, codeCells } from "../lib/loginCode";
import { currentLayout, layoutFromKey, type Layout } from "../lib/keyboardHints";
import { T } from "../i18n";
import { Icon } from "./Icon";
import { Done, RiseList, Spark, StepIn } from "./Motion";
import logoLight from "../../brand/kipple-logo-light.svg";
import logoDark from "../../brand/kipple-logo-dark.svg";
import mascot from "../../brand/kipple-mascot-light.svg";
import "./Welcome.css";

/** `**bold**` in the step texts. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part));
}

/**
 * The start screen (no library yet), "QR first": it opens on the Telegram QR code, the phone
 * number, the export file and the demo are quiet links. One column that starts at a fixed height
 * under a pinned logo, so titles stay on one line from step to step.
 */
export function Welcome(props: {
  /** Undefined in the browser build: no Telegram sign-in there, the screen opens on the export. */
  tg?: TelegramApi;
  showDemo?: boolean;
  onImport: () => void;
  /** Signed in: load Saved Messages straight from Telegram. Only from the user's button. */
  onLoadSaved?: () => void;
  onDemo: () => void;
  onSettings: () => void;
  /** Anonymous usage statistics on (desktop only; undefined hides the line). */
  telemetry?: boolean;
  onTelemetry?: (on: boolean) => void;
  /** Banners above the screen (web build, update available). */
  top?: ReactNode;
  children?: ReactNode;
}) {
  const [fromFile, setFromFile] = useState(!props.tg);
  // Kept here: the sign-in steps unmount while the export steps are shown.
  const counted = useRef({ started: false, failed: false });
  useStepFocus(fromFile ? "file" : "signin");
  const L = T.welcome;

  return (
    <div className="welcome2">
      {props.top}
      <header className="w-head">
        <span className="w-logo">
          <img src={logoLight} alt="Kipple" className="only-light" />
          <img src={logoDark} alt="Kipple" className="only-dark" />
        </span>
      </header>

      <main className="w-main">
        {fromFile || !props.tg ? (
          <section className="w-col" aria-labelledby="w-title">
            <div className="w-back-slot">
              {props.tg && (
                <button className="w-back" onClick={() => setFromFile(false)}>
                  <Icon name="left" size={14} />
                  {L.back}
                </button>
              )}
            </div>
            <StepIn id="file">
              <h1 className="w-h1" id="w-title" tabIndex={-1}>
                {L.importTitle}
              </h1>
              <RiseList className="w-steps" delay={0.1}>
                {L.steps.map((s, i) => (
                  <Fragment key={i}>
                    <span className="w-num">{i + 1}</span>
                    <span>{rich(s)}</span>
                  </Fragment>
                ))}
              </RiseList>
              <Spark>
                <button className="w-primary" onClick={props.onImport}>
                  {L.pickFolder}
                </button>
              </Spark>
              {props.showDemo && !props.tg && (
                <p className="w-links">
                  <button className="w-link" onClick={props.onDemo}>
                    {L.demoTitle}
                  </button>
                </p>
              )}
            </StepIn>
          </section>
        ) : (
          <SignIn counted={counted} tg={props.tg} showDemo={props.showDemo} onDemo={props.onDemo} onSettings={props.onSettings} onFile={() => setFromFile(true)} onLoadSaved={props.onLoadSaved} />
        )}
      </main>

      <footer className="w-foot">
        <span>
          <Icon name="lock" size={12} />
          {props.tg ? T.settings.subtitle : T.settings.subtitleWeb}
        </span>
        {props.telemetry !== undefined && props.onTelemetry && (
          <span>
            {props.telemetry ? L.statsOn : L.statsOff}{" "}
            <button className="link-btn" onClick={() => props.onTelemetry!(!props.telemetry)}>
              {props.telemetry ? L.statsTurnOff : L.statsTurnOn}
            </button>
          </span>
        )}
      </footer>
      {props.children}
    </div>
  );
}

/**
 * The link that changed the step unmounts with it; without this, keyboard focus would fall back
 * to the page. A step whose field took focus (autoFocus) keeps it.
 */
function useStepFocus(key: string) {
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) document.getElementById("w-title")?.focus({ preventScroll: true });
  }, [key]);
}

/** Anonymous statistics: sign-in offered, finished, or failed (each at most once per visit). */
type Counted = { current: { started: boolean; failed: boolean } };

type Step = "loading" | "noApi" | "qr" | "phone" | "code" | "password" | "done";

function SignIn(props: { counted: Counted; tg: TelegramApi; showDemo?: boolean; onDemo: () => void; onSettings: () => void; onFile: () => void; onLoadSaved?: () => void }) {
  const { tg } = props;
  const L = T.welcome;
  const TL = T.telegram;
  const [step, setStep] = useState<Step>("loading");
  const [mode, setMode] = useState<"qr" | "phone">("qr");
  const [qr, setQr] = useState<Extract<QrResult, { status: "qr" }> | null>(null);
  const [qrAttempt, setQrAttempt] = useState(0);
  const [qrStalled, setQrStalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function refresh() {
    setError(null);
    try {
      const s = await tg.status();
      setName(s.name ?? "");
      // A step the user picked while the first check ran (a link under the QR) stays.
      setStep((cur) => (!s.hasApi ? "noApi" : s.authorized ? "done" : cur === "loading" ? mode : cur));
    } catch (e) {
      setError(telegramErrorText(e));
      setStep((cur) => (cur === "loading" ? mode : cur));
    }
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { counted } = props;
  useEffect(() => {
    if ((step === "qr" || step === "phone") && !counted.current.started) {
      counted.current.started = true;
      track("tg_signin_started");
    }
    if (step === "done" && counted.current.started) track("tg_signin_completed");
  }, [step]);
  useEffect(() => {
    if (error && counted.current.started && !counted.current.failed) {
      counted.current.failed = true;
      track("tg_signin_failed");
    }
  }, [error]);

  // QR: poll while the code is on screen. Each call returns the current code, a fresh one
  // when it expires, or the result once the phone confirmed it.
  const polling = step === "qr";
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setQrStalled(false);
    const tick = async () => {
      try {
        const r = await tg.qrPoll();
        if (stopped) return;
        setError(null);
        if (r.status === "qr") {
          setQr(r);
          timer = setTimeout(tick, 1500);
        } else if (r.status === "password") {
          setQr(null);
          setHint(r.hint ?? null);
          setStep("password");
        } else {
          setQr(null);
          setName(r.name);
          setStep("done");
        }
      } catch (e) {
        if (stopped) return;
        setQr(null);
        setError(telegramErrorText(e));
        const flood = /^FLOOD_WAIT:(\d+)/.exec(String(e));
        if (flood) timer = setTimeout(tick, Number(flood[1]) * 1000 + 500);
        else setQrStalled(true);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      void tg.qrCancel().catch(() => undefined);
    };
  }, [polling, qrAttempt, tg]);

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

  function switchMode(next: "qr" | "phone") {
    setMode(next);
    setError(null);
    setQr(null);
    setCode("");
    setPassword("");
    setHint(null);
    setStep(next);
  }

  function signedIn(r: Awaited<ReturnType<TelegramApi["signIn"]>>) {
    if (r.status === "password") {
      setHint(r.hint ?? null);
      setStep("password");
    } else {
      setName(r.name);
      setStep("done");
    }
  }

  // Never show an expired code, even if a poll is late.
  const qrFresh = qr && qr.expires * 1000 > Date.now() ? qr : null;
  const errorLine = error && (
    <p className="w-error" role="alert">
      {error}
    </p>
  );
  const links = (items: { label: string; run: () => void }[]) => (
    <p className="w-links">
      {items.map((it, i) => (
        <span key={it.label}>
          {i > 0 && <span className="w-dot" aria-hidden>·</span>}
          <button className="w-link" onClick={it.run}>
            {it.label}
          </button>
        </span>
      ))}
    </p>
  );
  const fileAndDemo = [{ label: L.fromFile, run: props.onFile }, ...(props.showDemo ? [{ label: L.demoTitle, run: props.onDemo }] : [])];

  // The link above the column: never moves the title, the slot is there on every step.
  const back =
    step === "phone" ? (
      <button className="w-back" onClick={() => switchMode("qr")}>
        <Icon name="left" size={14} />
        {L.back}
      </button>
    ) : step === "password" && mode === "qr" ? (
      // After a QR scan no number was typed: back to the code, not to a "different number".
      <button className="w-back" onClick={() => switchMode("qr")}>
        <Icon name="left" size={14} />
        {L.back}
      </button>
    ) : step === "code" || step === "password" ? (
      <button className="w-back" onClick={() => switchMode("phone")}>
        <Icon name="left" size={14} />
        {TL.otherPhone}
      </button>
    ) : null;

  const qrScreen = step === "loading" || step === "qr";
  useStepFocus(qrScreen ? "qr" : step);

  return (
    <section className="w-col" aria-labelledby="w-title">
      <div className="w-back-slot">{back}</div>
      <StepIn id={qrScreen ? "qr" : step}>
        {qrScreen && (
          <>
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              {L.qrTitle}
            </h1>
            <div className="w-qr-tile" aria-busy={!qrFresh}>
              {qrFresh ? (
                <QrImage url={qrFresh.url} />
              ) : qrStalled ? (
                <button className="secondary w-qr-retry" onClick={() => setQrAttempt((n) => n + 1)}>
                  {L.qrRetry}
                </button>
              ) : (
                <span className="w-qr-wait" role="status">
                  <span className="w-sr">{L.qrLoading}</span>
                </span>
              )}
            </div>
            <p className="w-route">{rich(L.qrRoute)}</p>
            {errorLine}
            {links([{ label: L.byPhone, run: () => switchMode("phone") }, ...fileAndDemo])}
          </>
        )}

        {step === "noApi" && (
          <>
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              {L.qrTitle}
            </h1>
            <div className="w-quiet">
              <Icon name="lock" size={18} />
              <div>
                <p>{TL.noApi}</p>
                <button className="secondary" onClick={props.onSettings}>
                  {TL.openSettings}
                </button>
              </div>
            </div>
            {errorLine}
            {links(fileAndDemo)}
          </>
        )}

        {step === "phone" && (
          <form className="w-form" onSubmit={(e) => (e.preventDefault(), void run(async () => (await tg.requestCode(phone), setCode(""), setStep("code"))))}>
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              {L.phoneTitle}
            </h1>
            {/* The step title already says it; the label stays for screen readers. */}
            <label htmlFor="w-phone" className="w-sr">
              {L.phoneLabel}
            </label>
            <input id="w-phone" type="tel" autoComplete="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={TL.phonePlaceholder} />
            {errorLine}
            <button className="w-primary" disabled={busy || !phone.trim()}>
              {TL.getCode}
            </button>
            {links([{ label: L.useQr, run: () => switchMode("qr") }])}
          </form>
        )}

        {step === "code" && (
          <form className="w-form" onSubmit={(e) => (e.preventDefault(), void run(async () => signedIn(await tg.signIn(code))))}>
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              {L.codeTitle}
            </h1>
            <p className="w-lead">{L.codeSent(phone.trim())}</p>
            <CodeCells value={code} onChange={setCode} />
            {errorLine}
            <button className="w-primary" disabled={busy || !code}>
              {TL.signIn}
            </button>
          </form>
        )}

        {step === "password" && (
          <form
            className="w-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await tg.checkPassword(password);
                setPassword("");
                if (r.status === "ok") setName(r.name);
                await refresh();
              });
            }}
          >
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              {L.passwordTitle}
            </h1>
            <p className="w-lead">
              {L.passwordLead}
              {hint ? ` ${L.passwordHint(hint)}` : ""}
            </p>
            <label htmlFor="w-pass" className="w-sr">
              {L.passwordLabel}
            </label>
            <PasswordInput value={password} onChange={setPassword} />
            {errorLine}
            <button className="w-primary" disabled={busy || !password}>
              {TL.signIn}
            </button>
          </form>
        )}

        {step === "done" && (
          <>
            <h1 className="w-h1" id="w-title" tabIndex={-1}>
              <Done label={L.signedIn(name)} />
            </h1>
            <p className="w-lead">{props.onLoadSaved ? L.signedInLoad : L.signedInNext}</p>
            <Spark>
              <button className="w-primary" onClick={props.onLoadSaved ?? props.onFile}>
                {props.onLoadSaved ? L.loadSaved : L.toExport}
              </button>
            </Spark>
            {errorLine}
            {links([
              ...(props.onLoadSaved ? [{ label: L.fromFile, run: props.onFile }] : []),
              {
                label: L.signOut,
                run: () =>
                  void run(async () => {
                    // Signed out here even if Telegram didn't answer; the error (if any) still shows.
                    try {
                      await tg.logout();
                    } finally {
                      switchMode("qr");
                    }
                  }),
              },
            ])}
          </>
        )}
      </StepIn>
    </section>
  );
}

/**
 * The cloud password field: a show/hide button, and two quiet hints under it (the keyboard layout
 * that types now, a warning while Caps Lock is on), since the field hides what is typed.
 */
function PasswordInput(props: { value: string; onChange: (password: string) => void }) {
  const [caps, setCaps] = useState(false);
  // Shown on request, also after "wrong password": the typed text stays, so it can be checked.
  const [show, setShow] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    let alive = true;
    void currentLayout().then((l) => alive && l && setLayout((cur) => cur ?? l));
    return () => {
      alive = false;
    };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    setCaps(e.getModifierState("CapsLock"));
    const l = layoutFromKey(e.key);
    if (l) setLayout(l);
  };
  const W = T.welcome;
  return (
    <>
      <div className="w-pass">
        <input
          id="w-pass"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          aria-describedby={caps ? "w-caps" : undefined}
        />
        <button
          type="button"
          className="w-eye"
          aria-label={show ? W.hidePassword : W.showPassword}
          title={show ? W.hidePassword : W.showPassword}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          <Icon name={show ? "eyeOff" : "eye"} size={18} />
        </button>
      </div>
      <p className="w-keys">
        {layout && <span>{W.keyboardLayout(layout)}</span>}
        {caps && (
          <span className="w-caps" id="w-caps" role="status">
            {W.capsLock}
          </span>
        )}
      </p>
    </>
  );
}

/**
 * The login code as cells. One real input lies over them, so typing, pasting, Backspace and the
 * OS's one-time-code autofill all work as in any text field; the cells only draw its value.
 */
function CodeCells(props: { value: string; onChange: (code: string) => void }) {
  const [focused, setFocused] = useState(true);
  const { digits, active } = codeCells(props.value);
  return (
    <div className="w-code">
      <input
        aria-label={T.welcome.codeLabel}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        value={props.value}
        onChange={(e) => props.onChange(cleanCode(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {digits.map((d, i) => (
        <span key={i} className={`w-cell${focused && i === active ? " on" : ""}`} aria-hidden>
          {d}
        </span>
      ))}
    </div>
  );
}

function QrImage({ url }: { url: string }) {
  const { size, d } = qrPath(url);
  return (
    <div className="w-qr" role="img" aria-label={T.welcome.qrAlt}>
      <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges">
        <rect x={-1} y={-1} width={size + 2} height={size + 2} style={{ fill: "var(--fixed-paper)" }} />
        <path d={d} style={{ fill: "var(--fixed-qr)" }} />
      </svg>
      <img src={mascot} alt="" className="w-qr-logo" />
    </div>
  );
}
