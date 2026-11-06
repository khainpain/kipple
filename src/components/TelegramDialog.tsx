import { useEffect, useMemo, useState } from "react";
import { platform } from "@platform";
import type { TelegramApi, TelegramStatus } from "../platform/types";
import type { Card } from "../lib/types";
import { BOARD_TITLE, buildPlan, telegramErrorText, type BoardState, type SendOptions } from "../lib/telegram";
import { loadBoardState } from "../lib/store";

type Step = "loading" | "api" | "phone" | "code" | "password" | "ready";

/** Logs in to the user's Telegram account and starts sending the library to the «Saved Board» group. */
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

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings telegram" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
        <h2>Отправить в Telegram</h2>
        <p className="hint">
          Приложение создаст у тебя закрытую группу «{BOARD_TITLE}» с темами по разделам библиотеки и перешлёт туда оригиналы сообщений из «Избранного». Под каждым будет короткое описание и
          хештеги. Вход идёт напрямую в Telegram, ключ сеанса хранится только на этом компьютере, в диспетчере учётных данных Windows.
        </p>

        {step === "loading" && <p className="hint">Проверяю вход…</p>}

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
              Нужен один раз: ключ приложения Telegram. Открой {link("https://my.telegram.org/apps", "my.telegram.org")}, войди по номеру, в «API development tools» создай приложение (название любое,
              платформа Desktop) и скопируй сюда <b>api_id</b> и <b>api_hash</b>.
            </p>
            <div className="row">
              <label>
                api_id
                <input inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="1234567" />
              </label>
              <label>
                api_hash
                <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="32 символа" />
              </label>
            </div>
            <div className="dialog-buttons">
              <span className="spacer" />
              {showApi && (
                <button type="button" className="secondary" onClick={() => setShowApi(false)}>
                  Отмена
                </button>
              )}
              <button disabled={busy || !apiId.trim() || !apiHash.trim()}>Сохранить</button>
            </div>
          </form>
        )}

        {step === "phone" && !showApi && (
          <form className="tg-form" onSubmit={(e) => (e.preventDefault(), void run(async () => (await tg.requestCode(phone), setStep("code"))))}>
            <label>
              Номер телефона аккаунта Telegram
              <input type="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" />
            </label>
            <div className="dialog-buttons">
              {!status?.builtInApi && (
                <button type="button" className="secondary" onClick={() => setShowApi(true)}>
                  Сменить api_id
                </button>
              )}
              <span className="spacer" />
              <button disabled={busy || !phone.trim()}>Получить код</button>
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
              Код из Telegram (придёт в чат «Telegram» на телефоне или в Telegram Desktop)
              <input inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" />
            </label>
            <div className="dialog-buttons">
              <button type="button" className="secondary" onClick={() => (setCode(""), setStep("phone"))}>
                Другой номер
              </button>
              <span className="spacer" />
              <button disabled={busy || !code.trim()}>Войти</button>
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
              Облачный пароль (двухэтапная проверка){hint ? `, подсказка: ${hint}` : ""}
              <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button disabled={busy || !password}>Войти</button>
            </div>
          </form>
        )}

        {step === "ready" && !showApi && (
          <>
            <p>
              Вход выполнен{name ? <>: <b>{name}</b></> : ""}.{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), void run(async () => (await tg.logout(), await refresh())))}>
                Выйти
              </a>
            </p>
            <label className="check">
              <input type="checkbox" checked={opts.includeJunk} onChange={(e) => setOpts({ ...opts, includeJunk: e.target.checked })} />
              Отправлять и «Мусор»
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.includeSensitive} onChange={(e) => setOpts({ ...opts, includeSensitive: e.target.checked })} />
              Отправлять «Чувствительное» (пароли, номера карт). Группа закрытая, но лучше держать их отдельно
            </label>
            <p className="hint">
              {plan.length
                ? `К отправке: ${plan.length} карточек в ${topicCount} ${topicCount === 1 ? "тему" : topicCount < 5 ? "темы" : "тем"}, примерно ${minutes} мин. Telegram ограничивает скорость, поэтому сообщения уходят постепенно. Приложение должно быть открыто; если закрыть его раньше, потом нажми «Отправить» ещё раз, и отправка продолжится с того же места.`
                : "Всё уже отправлено. Новые сохранёнки появятся здесь после следующего импорта."}
              {sentCount > 0 && ` Уже в группе: ${sentCount}.`}
              {untagged > 0 && ` ${untagged} карточек ещё без AI-разметки попадут в тему «Разное»; лучше сначала нажать «Разметить».`}
            </p>
            <div className="dialog-buttons">
              <span className="spacer" />
              <button className="secondary" onClick={props.onClose}>
                Закрыть
              </button>
              <button disabled={busy || props.running || !plan.length} onClick={() => props.onStart(opts)}>
                {props.running ? "Уже отправляю…" : `Отправить ${plan.length}`}
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
