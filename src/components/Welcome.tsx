import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { QrResult, TelegramApi } from "../platform/types";
import { telegramErrorText } from "../lib/telegram";
import { qrPath } from "../lib/qr";
import { ANGRY_MS, INITIAL_TAPS, SALTO_MS, tapMascot } from "../lib/mascot";
import { nextThemePref, setThemePref, THEME_ICONS, THEME_LABELS, useThemePref } from "../lib/theme";
import { LANGS, T, lang, type Lang } from "../i18n";
import { Icon } from "./Icon";
import { BounceIn, Done, Reveal, RiseList, Spark, StepBar, Title } from "./Motion";
import logoLight from "../../brand/kipple-logo-light.svg";
import logoDark from "../../brand/kipple-logo-dark.svg";
import mascot from "../../brand/kipple-mascot-light.svg";
import mascotNoFace from "../assets/welcome/kipple-mascot-noface-light.svg";
import shakshuka from "../assets/welcome/shakshuka.svg";
import containerQueries from "../assets/welcome/container-queries.svg";
import "./Welcome.css";

/** `**bold**` and `` `code` ``, and desktop.telegram.org as a link, in the export steps. */
function rich(text: string, openUrl: (url: string) => void): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|desktop\.telegram\.org)/).map((part, i) => {
    if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part === "desktop.telegram.org")
      return (
        <a key={i} href="https://desktop.telegram.org" onClick={(e) => (e.preventDefault(), openUrl("https://desktop.telegram.org"))}>
          {part}
        </a>
      );
    return part;
  });
}

/** The start screen: sign in to Telegram (QR or phone) or import an export, with an animated collage on the right. */
export function Welcome(props: {
  /** Undefined in the browser build: no Telegram sign-in there. */
  tg?: TelegramApi;
  showDemo?: boolean;
  onImport: () => void;
  /**
   * Signed in: load Saved Messages straight from Telegram. `auto` is true when the card calls it
   * by itself on reaching the signed-in state; false from the button.
   */
  onSignedIn?: (auto: boolean) => void;
  onDemo: () => void;
  onSettings: () => void;
  onLanguage: (l: Lang) => void;
  openUrl: (url: string) => void;
  /** Banners above the header (web build, update available). */
  top?: ReactNode;
  children?: ReactNode;
}) {
  const [screen, setScreen] = useState<0 | 1>(0);
  const theme = useThemePref();
  const L = T.welcome;
  const otherLang = LANGS.find((l) => l.key !== lang())!;

  return (
    <div className="welcome2">
      {props.top}
      <header className="w-header">
        <span className="w-logo">
          <img src={logoLight} alt="Kipple" className="only-light" />
          <img src={logoDark} alt="Kipple" className="only-dark" />
        </span>
        <span className="spacer" />
        <button className="w-lang" onClick={() => props.onLanguage(otherLang.key)} title={L.language(otherLang.name)} aria-label={L.language(otherLang.name)}>
          {lang().toUpperCase()}
        </button>
        <button className="icon-btn" onClick={props.onSettings} title={L.settings} aria-label={L.settings}>
          <Icon name="settings" size={18} />
        </button>
        <button className="icon-btn" onClick={() => setThemePref(nextThemePref(theme))} title={T.theme.toggle(THEME_LABELS[theme])} aria-label={T.theme.toggle(THEME_LABELS[theme])}>
          <Icon name={THEME_ICONS[theme]} size={18} />
        </button>
      </header>

      <main className="w-body">
        <div className="w-left">
          <div className="w-viewport">
            <div className="w-track" style={{ transform: `translateX(${screen ? "-50%" : "0"})` }}>
              <section className={`w-pane${screen === 0 ? " on" : ""}`} inert={screen !== 0} aria-hidden={screen !== 0}>
                <h1 className="w-h1">
                  <Title text={L.title} />
                </h1>
                <Reveal stagger delay={0.15} className="w-reveal">
                  <p className="w-lead">{L.lead}</p>
                  <span className="w-safe">
                    <span className="w-safe-dot">
                      <Icon name="lock" size={11} />
                    </span>
                    {L.localOnly}
                  </span>
                  {props.tg && <SignInCard tg={props.tg} active={screen === 0} onSettings={props.onSettings} onExport={() => setScreen(1)} onSignedIn={props.onSignedIn} />}
                  {props.tg && <div className="w-or">{L.orWithout}</div>}
                  <div className="w-tiles">
                  <button className="w-tile grow" onClick={() => setScreen(1)}>
                    <span className="w-tile-icon">
                      <Icon name="folder" size={18} />
                    </span>
                    <span className="w-tile-text">
                      <b>{L.importTitle}</b>
                      <small>{L.importHint}</small>
                    </span>
                    <Icon name="right" size={16} className="w-chev" />
                  </button>
                  {props.showDemo && (
                    <button className="w-tile demo" onClick={props.onDemo}>
                      <span className="w-tile-icon">
                        <Icon name="sparkle" size={18} />
                      </span>
                      <span className="w-tile-text">
                        <b>{L.demoTitle}</b>
                        <small>{L.demoHint}</small>
                      </span>
                    </button>
                  )}
                  </div>
                </Reveal>
              </section>

              <section className={`w-pane${screen === 1 ? " on" : ""}`} inert={screen !== 1} aria-hidden={screen !== 1}>
                <button className="w-back" onClick={() => setScreen(0)}>
                  <Icon name="right" size={14} className="flip" />
                  {L.back}
                </button>
                <h1 className="w-h1 small">{screen === 1 ? <Title text={L.exportTitle} /> : L.exportTitle}</h1>
                <p className="w-lead">{L.exportLead}</p>
                {/* Replays its entrance each time the screen slides in. */}
                <RiseList className="w-steps" play={screen} delay={screen === 1 ? 0.2 : 0}>
                  {L.steps.map((s, i) => (
                    <Fragment key={i}>
                      <span className="w-num">{i + 1}</span>
                      <span>{rich(s, props.openUrl)}</span>
                    </Fragment>
                  ))}
                </RiseList>
                <div className="w-actions">
                  <Spark>
                    <button className="w-primary" onClick={props.onImport}>
                      <Icon name="folder" size={18} />
                      {L.pickFolder}
                    </button>
                  </Spark>
                  {props.showDemo && (
                    <button className="secondary w-secondary" onClick={props.onDemo}>
                      {L.demo}
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
        <div className="w-right">
          <Collage />
        </div>
      </main>
      {props.children}
    </div>
  );
}

type Step = "loading" | "noApi" | "qr" | "phone" | "code" | "password" | "done";

function SignInCard(props: { tg: TelegramApi; active: boolean; onSettings: () => void; onExport: () => void; onSignedIn?: (auto: boolean) => void }) {
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
      setStep(!s.hasApi ? "noApi" : s.authorized ? "done" : mode);
    } catch (e) {
      setError(telegramErrorText(e));
      setStep(mode);
    }
  }

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in: the messages start loading by themselves, no export needed.
  const onSignedIn = props.onSignedIn;
  useEffect(() => {
    if (step === "done") onSignedIn?.(true);
  }, [step, onSignedIn]);

  // QR: poll while the code is on screen. Each call returns the current code, a fresh one
  // when it expires, or the result once the phone confirmed it.
  const polling = step === "qr" && props.active;
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
    setStep(next);
  }

  // Never show an expired code, even if a poll is late.
  const qrFresh = qr && qr.expires * 1000 > Date.now() ? qr : null;
  const phoneIdx = step === "code" ? 1 : step === "password" ? 2 : 0;
  const showPhoneSteps = mode === "phone" && (step === "phone" || step === "code" || step === "password");

  return (
    <div className="w-card">
      <div className="w-card-main">
        <div className="w-card-head">
          <span className="w-card-icon">
            <Icon name="send" size={18} />
          </span>
          <h2>{mode === "qr" ? L.qrTitle : L.phoneTitle}</h2>
        </div>

        {step === "loading" && <p className="hint">{TL.checking}</p>}

        {step === "noApi" && (
          <div className="w-quiet">
            <Icon name="lock" size={18} />
            <div>
              <p>{TL.noApi}</p>
              <button className="secondary" onClick={props.onSettings}>
                {TL.openSettings}
              </button>
            </div>
          </div>
        )}

        {step === "qr" && (
          <div className="w-qr-row">
            <div className="w-qr-tile">
              {qrFresh ? <QrImage url={qrFresh.url} /> : <span className="w-qr-wait">{qrStalled ? "" : L.qrLoading}</span>}
              {qrStalled && (
                <button className="secondary w-qr-retry" onClick={() => setQrAttempt((n) => n + 1)}>
                  {L.qrRetry}
                </button>
              )}
            </div>
            <RiseList className="w-qr-steps" delay={0.5}>
              {L.qrSteps.map((s, i) => (
                <Fragment key={i}>
                  <span className="w-num soft">{i + 1}</span>
                  <span>{rich(s, () => undefined)}</span>
                </Fragment>
              ))}
            </RiseList>
          </div>
        )}

        {showPhoneSteps && (
          <div className="w-stepper" aria-hidden>
            {[L.stepPhone, L.stepCode, L.stepPassword].map((s, i) => (
              <div key={i} className={i <= phoneIdx ? "on" : ""}>
                <StepBar on={i <= phoneIdx} />
                <span>
                  {s}
                  {i === 2 && <small> · {L.stepOptional}</small>}
                </span>
              </div>
            ))}
          </div>
        )}

        {step === "phone" && (
          <form className="w-form" onSubmit={(e) => (e.preventDefault(), void run(async () => (await tg.requestCode(phone), setStep("code"))))}>
            <label htmlFor="w-phone">{TL.phone}</label>
            <div className="w-inline">
              <input id="w-phone" type="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={TL.phonePlaceholder} />
              <button disabled={busy || !phone.trim()}>{TL.getCode}</button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form
            className="w-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await tg.signIn(code);
                if (r.status === "password") {
                  setHint(r.hint ?? null);
                  setStep("password");
                } else {
                  setName(r.name);
                  setStep("done");
                }
              });
            }}
          >
            <label htmlFor="w-code">{TL.code}</label>
            <div className="w-inline">
              <input id="w-code" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
              <button disabled={busy || !code.trim()}>{TL.signIn}</button>
            </div>
            <button type="button" className="link-btn w-small-link" onClick={() => (setCode(""), setStep("phone"))}>
              {TL.otherPhone}
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
            <label htmlFor="w-pass">
              {TL.password}
              {hint ? TL.passwordHint(hint) : ""}
            </label>
            <div className="w-inline">
              <input id="w-pass" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              <button disabled={busy || !password}>{TL.signIn}</button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="w-done">
            <p>
              <Done label={L.signedIn(name)} />
            </p>
            <p className="hint">{props.onSignedIn ? L.signedInLoad : L.signedInNext}</p>
            <div className="w-inline">
              {props.onSignedIn ? (
                <>
                  <button onClick={() => props.onSignedIn?.(false)}>{L.loadSaved}</button>
                  <button className="link-btn w-small-link" onClick={props.onExport}>
                    {L.orExport}
                  </button>
                </>
              ) : (
                <button onClick={props.onExport}>{L.toExport}</button>
              )}
              <button className="link-btn w-small-link" onClick={() => void run(async () => (await tg.logout(), switchMode("qr")))}>
                {L.signOut}
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {(step === "qr" || showPhoneSteps) && (
          <button className="w-switch" onClick={() => switchMode(mode === "qr" ? "phone" : "qr")}>
            {mode === "qr" ? L.usePhone : L.useQr}
          </button>
        )}
      </div>
      <div className="w-card-foot">
        <Icon name="lock" size={13} />
        {L.privacy}
      </div>
    </div>
  );
}

function QrImage({ url }: { url: string }) {
  const { size, d } = qrPath(url);
  return (
    <div className="w-qr" role="img" aria-label={T.welcome.qrAlt}>
      <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges">
        <rect x={-1} y={-1} width={size + 2} height={size + 2} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <img src={mascot} alt="" className="w-qr-logo" />
    </div>
  );
}

/** The mascot's face, drawn over the faceless body so it can blink, talk or get angry. */
function Face({ angry, talking }: { angry?: boolean; talking?: boolean }) {
  const ink = "#23211E";
  return (
    <svg viewBox="0 0 100 100" className="kp-face" aria-hidden>
      {angry ? (
        <g fill="none" stroke={ink} strokeLinecap="round">
          <path d="M31 37.5 L43.5 42.5" strokeWidth="4" />
          <path d="M69 37.5 L56.5 42.5" strokeWidth="4" />
          <circle cx="38.5" cy="47.5" r="2.8" fill={ink} stroke="none" />
          <circle cx="61.5" cy="47.5" r="2.8" fill={ink} stroke="none" />
          <path d="M45 56.5 Q50 52 55 56.5" strokeWidth="3.2" />
          <path d="M74 20 l4 -4 M80 24 l5 -2 M77 29 l5 1" strokeWidth="2.4" className="kp-steam" />
        </g>
      ) : (
        <g fill="none" stroke={ink} strokeLinecap="round">
          <path className="kp-eye" d="M32.5 46 Q38 38.5 43.5 46" strokeWidth="4.6" />
          <path className="kp-eye" d="M56.5 46 Q62 38.5 67.5 46" strokeWidth="4.6" />
          {talking ? <ellipse className="kp-mouth" cx="50" cy="54.5" rx="3.6" ry="3" fill={ink} stroke="none" /> : <path d="M46 53 Q50 56.5 54 53" strokeWidth="3.2" />}
        </g>
      )}
    </svg>
  );
}

function Mascot() {
  const taps = useRef(INITIAL_TAPS);
  const [flip, setFlip] = useState(0);
  const [angry, setAngry] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function onClick() {
    const { state, effect } = tapMascot(taps.current, Date.now());
    taps.current = state;
    if (effect === "salto") {
      setFlip((n) => n + 1);
      timers.current.push(setTimeout(() => setFlip(0), SALTO_MS));
    } else if (effect === "angry") {
      setFlip(0);
      setAngry(true);
      timers.current.push(setTimeout(() => setAngry(false), ANGRY_MS));
    }
  }

  const cls = angry ? "kp-angry" : flip ? "kp-flip" : "";
  return (
    <button className="kp-mascot kp-tap kp-bob" aria-label="Kipple" onClick={onClick}>
      <div>
        <Spark style={{ width: "100%", height: "100%" }}>
          <div key={flip} className={`kp-body ${cls}`}>
            <img src={mascotNoFace} alt="" draggable={false} />
            <Face angry={angry} />
          </div>
        </Spark>
      </div>
    </button>
  );
}

function Collage() {
  const L = T.welcome;
  return (
    <div className="w-collage">
      <div className="w-soft" aria-hidden />
      <BounceIn index={0} className="w-cc-pos" style={{ left: 0, top: 70, width: 170 }}>
        <div className="w-cc card kp-f kp-f1" style={{ ["--r" as string]: "-5deg" }} aria-hidden>
          <div className="cover">
            <img src={containerQueries} alt="" style={{ height: 72, objectFit: "cover" }} />
          </div>
          <div className="card-body">
            <h3>{L.cardCq}</h3>
            <div className="tags">
              <span className="pill action-read_later">{L.readLater}</span>
            </div>
          </div>
        </div>
      </BounceIn>
      <BounceIn index={1} className="w-cc-pos" style={{ right: 0, top: 30, width: 160 }}>
        <div className="w-cc card kp-f kp-f2" style={{ ["--r" as string]: "4deg" }} aria-hidden>
          <div className="card-body">
            <h3>{L.cardBot}</h3>
            <div className="tags">
              <span className="pill action-idea">{L.idea}</span>
            </div>
          </div>
        </div>
      </BounceIn>
      <BounceIn index={2} className="w-cc-pos" style={{ left: 242, top: 344, width: 178 }}>
        <div className="w-cc card kp-f kp-f3" style={{ ["--r" as string]: "-3deg" }} aria-hidden>
          <div className="cover">
            <img src={shakshuka} alt="" style={{ height: 84, objectFit: "cover" }} />
          </div>
          <div className="card-body">
            <h3>{L.cardShakshuka}</h3>
            <div className="tags">
              <span className="tag">{L.tagRecipes}</span>
            </div>
          </div>
        </div>
      </BounceIn>
      <BounceIn index={3} className="w-cc-pos" style={{ left: 0, top: 384, width: 214 }}>
        <div className="w-cc card kp-f kp-f4" style={{ ["--r" as string]: "3deg" }} aria-hidden>
          <div className="cover w-video">
            <div className="w-video-mascot kp-hop">
              <img src={mascotNoFace} alt="" />
              <Face talking />
            </div>
            <div className="w-bubble">
              {L.speech.map((s, i) => (
                <span key={i} className="kp-cap" style={{ animationDelay: `${i * 3}s` }}>
                  {s}
                </span>
              ))}
            </div>
            <div className="w-player">
              <span className="w-play" />
              <span className="w-bar">
                <i className="kp-prog" />
              </span>
            </div>
            <span className="badge-corner">0:30</span>
          </div>
          <div className="card-body">
            <h3>{L.cardVideo}</h3>
            <div className="tags">
              <span className="pill action-read_later">{L.watchLater}</span>
              <span className="tag">{L.tagVideo}</span>
            </div>
            <div className="meta-row">
              <span className="site">youtube.com</span>
            </div>
          </div>
        </div>
      </BounceIn>
      <Mascot />
    </div>
  );
}
