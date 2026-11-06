import { useEffect, useState } from "react";
import { platform } from "@platform";
import type { Settings } from "../lib/store";
import { AI_MODELS, aiModelOf, builtinUsage, costEstimate } from "../lib/ai";
import { getInstallId } from "../lib/secrets";
import { setThemePref, THEME_ICONS, THEME_LABELS, THEME_PREFS, useThemePref } from "../lib/theme";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { AiConsentDialog } from "./AiConsent";
import { LANGS, T, systemLang, type LangPref } from "../i18n";
import { telegramErrorText } from "../lib/telegram";
import type { TelegramApi, TelegramStatus } from "../platform/types";

export function SettingsDialog(props: {
  settings: Settings;
  hasKey: boolean;
  version: string;
  onSave: (s: Settings, apiKey: string | null) => void;
  /** Number of already tagged cards a re-tag would send again. */
  retagCount: number;
  onRetag: (s: Settings, apiKey: string | null) => void;
  onWipe: () => void;
  /** Deletes the user's own key, so AI goes back to the built-in one. */
  onForgetKey: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(props.settings);
  const [key, setKey] = useState("");
  /** Ticking AI on without an earlier consent first shows the consent dialog. */
  const [asking, setAsking] = useState(false);
  const theme = useThemePref();
  const L = T.settings;
  const systemName = LANGS.find((l) => l.key === systemLang())?.name ?? "";
  // How much of today's built-in allowance is used; only asked when AI is on and there is no own key
  // (in no-AI mode the app doesn't contact the Kipple server at all).
  const [used, setUsed] = useState<number | null>(null);
  const aiOn = props.settings.aiEnabled && !!props.settings.aiConsentAt;
  useEffect(() => {
    if (props.hasKey || !aiOn) return;
    let live = true;
    void getInstallId()
      .then(builtinUsage)
      .then((u) => live && setUsed(u));
    return () => {
      live = false;
    };
  }, [props.hasKey, aiOn]);

  return (
    <>
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label={T.common.close}>
          ×
        </button>
        <h2>{L.title}</h2>

        <div className="field">
          <span id="theme-label">{T.theme.label}</span>
          <div className="segmented labeled" role="radiogroup" aria-labelledby="theme-label">
            {THEME_PREFS.map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => setThemePref(t)}>
                <Icon name={THEME_ICONS[t]} size={14} /> {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span id="language-label">{L.language}</span>
          <Select<LangPref>
            labelledBy="language-label"
            value={s.language}
            options={[{ value: "auto", label: L.languageAuto(systemName) }, ...LANGS.map((l) => ({ value: l.key as LangPref, label: l.name }))]}
            onChange={(v) => setS({ ...s, language: v })}
          />
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={s.aiEnabled}
            onChange={(e) =>
              e.target.checked
                ? s.aiConsentAt
                  ? setS({ ...s, aiEnabled: true })
                  : setAsking(true)
                : // Turning AI off also takes back the consent, so turning it on again asks again.
                  setS({ ...s, aiEnabled: false, aiImages: false, aiConsentAt: undefined, aiAsked: true })
            }
          />
          {L.aiEnabled}
        </label>
        {!s.aiEnabled && <p className="hint">{L.aiOff}</p>}
        <fieldset className="ai-lang" disabled={!s.aiEnabled}>
          <legend>{L.aiLanguage}</legend>
          <label className="check">
            <input type="radio" name="ai-lang" checked={s.aiLanguage === "ui"} onChange={() => setS({ ...s, aiLanguage: "ui" })} />
            {L.aiLanguageUi}
          </label>
          <label className="check">
            <input type="radio" name="ai-lang" checked={s.aiLanguage === "source"} onChange={() => setS({ ...s, aiLanguage: "source" })} />
            {L.aiLanguageSource}
          </label>
          {s.aiLanguage !== props.settings.aiLanguage && <p className="hint">{L.aiLanguageNote}</p>}
        </fieldset>
        <fieldset className="ai-lang" disabled={!s.aiEnabled}>
          <legend>{L.aiModel}</legend>
          {AI_MODELS.map((m) => (
            <label key={m} className="check">
              <input type="radio" name="ai-model" checked={aiModelOf(s.aiModel) === m} onChange={() => setS({ ...s, aiModel: m })} />
              <span>
                <b>{L.aiModels[m].name}</b> · {L.aiModels[m].hint}
              </span>
            </label>
          ))}
          {aiModelOf(s.aiModel) !== aiModelOf(props.settings.aiModel) && <p className="hint">{L.aiModelNote}</p>}
          {props.retagCount > 0 && (
            <div>
              <button
                className="secondary small"
                onClick={() => {
                  const m = aiModelOf(s.aiModel);
                  if (confirm(L.retagConfirm(props.retagCount, L.aiModels[m].name, costEstimate(props.retagCount, m)))) props.onRetag(s, key.trim() || null);
                }}
              >
                {L.retag}
              </button>
            </div>
          )}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={s.aiImages} disabled={!s.aiEnabled} onChange={(e) => setS({ ...s, aiImages: e.target.checked })} />
          <span>{L.aiImages}</span>
        </label>
        <p className="hint" hidden={!s.aiEnabled}>
          {props.hasKey ? L.aiViaOwnKey : L.aiViaBuiltin}
          {!props.hasKey && used !== null && <> {L.builtinUsed(Math.round(used * 100))}</>}
        </p>
        <details className="own-key" open={props.hasKey || undefined}>
          <summary>{L.ownKey}</summary>
          <p className="hint">{L.ownKeyWhy}</p>
          <label>
            {L.apiKey} {props.hasKey && <span className="ok">{L.keySaved}</span>}
            <input type="password" placeholder={props.hasKey ? L.keyKeep : "sk-ant-..."} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <p className="hint">
            {platform.kind === "web" ? L.keyWhereWeb : L.keyWhereDesktop} {L.keyGet}{" "}
            <a href="#" onClick={(e) => (e.preventDefault(), platform.openUrl("https://console.anthropic.com/settings/keys"))}>
              console.anthropic.com
            </a>
            {L.keyCost}
          </p>
          {props.hasKey && (
            <button className="secondary small" onClick={() => confirm(L.forgetKeyConfirm) && props.onForgetKey()}>
              {L.forgetKey}
            </button>
          )}
        </details>
        <label className="check" hidden={!platform.canFetchLinks}>
          <input type="checkbox" checked={s.fetchLinks} onChange={(e) => setS({ ...s, fetchLinks: e.target.checked })} />
          {L.fetchLinks}
          {platform.kind === "web" ? L.fetchLinksWeb : ""}
        </label>

        {platform.telegram && (
          <details className="advanced">
            <summary>{L.advanced}</summary>
            <TelegramKey tg={platform.telegram} />
          </details>
        )}

        {props.version && <p className="hint">{L.version(props.version)}</p>}

        <div className="dialog-buttons">
          <button className="danger" onClick={() => confirm(L.wipeConfirm) && props.onWipe()}>
            {L.wipe}
          </button>
          <span className="spacer" />
          <button onClick={props.onClose} className="secondary">
            {T.common.cancel}
          </button>
          <button onClick={() => props.onSave(s, key.trim() || null)}>{T.common.save}</button>
        </div>
      </div>
    </div>
    {asking && (
      <AiConsentDialog
        hasKey={props.hasKey}
        onAllow={() => (setS({ ...s, aiEnabled: true, aiConsentAt: new Date().toISOString(), aiAsked: true }), setAsking(false))}
        onDecline={() => (setS({ ...s, aiAsked: true }), setAsking(false))}
      />
    )}
    </>
  );
}

/**
 * The user's own api_id / api_hash from my.telegram.org. The app normally ships with its own key,
 * so this is only for when that one stops working (or for builds without it). Saved on its own,
 * straight into the OS credential store, separately from the dialog's Save button.
 */
function TelegramKey(props: { tg: TelegramApi }) {
  const { tg } = props;
  const L = T.settings;
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => tg.status().then(setStatus, () => undefined);
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>, done: string | null) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(done);
      await refresh();
    } catch (e) {
      setError(telegramErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const noBuiltIn = status !== null && !status.builtInApi;

  return (
    <form
      className="tg-api"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => (await tg.setApi(apiId, apiHash), setApiId(""), setApiHash("")), L.tgApiSaved);
      }}
    >
      <span>
        <b>{L.tgApi}</b> {status?.customApi && <span className="ok">{L.tgApiCustom}</span>}
      </span>
      <p className="hint">
        {noBuiltIn ? L.tgApiWhyNoBuiltIn : L.tgApiWhy} {L.tgApiHow1}
        <a href="#" onClick={(e) => (e.preventDefault(), platform.openUrl("https://my.telegram.org/apps"))}>
          my.telegram.org
        </a>
        {L.tgApiHow2}
      </p>
      <div className="row">
        <label>
          api_id
          <input inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="1234567" />
        </label>
        <label>
          api_hash
          <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder={L.tgApiHashPlaceholder} />
        </label>
      </div>
      <div className="dialog-buttons">
        {status?.customApi && status.builtInApi && (
          <button type="button" className="secondary small" disabled={busy} onClick={() => void run(() => tg.clearApi(), null)}>
            {L.tgApiReset}
          </button>
        )}
        <span className="spacer" />
        <button className="secondary small" disabled={busy || !apiId.trim() || !apiHash.trim()}>
          {L.tgApiSave}
        </button>
      </div>
      {note && <p className="hint">{note}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
