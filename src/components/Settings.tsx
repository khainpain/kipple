import { useEffect, useState } from "react";
import { platform } from "@platform";
import type { Settings } from "../lib/store";
import { AI_MODELS, aiModelOf, costEstimate } from "../lib/ai";
import { setThemePref, THEME_ICONS, THEME_LABELS, THEME_PREFS, useThemePref } from "../lib/theme";
import { Icon } from "./Icon";
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
  onClose: () => void;
}) {
  const [s, setS] = useState(props.settings);
  const [key, setKey] = useState("");
  const theme = useThemePref();
  const L = T.settings;
  const systemName = LANGS.find((l) => l.key === systemLang())?.name ?? "";

  return (
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

        <label>
          {L.language}
          <select value={s.language} onChange={(e) => setS({ ...s, language: e.target.value as LangPref })}>
            <option value="auto">{L.languageAuto(systemName)}</option>
            {LANGS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

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

        <label className="check">
          <input type="checkbox" checked={s.aiEnabled} onChange={(e) => setS({ ...s, aiEnabled: e.target.checked })} />
          {L.aiEnabled}
        </label>
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
                disabled={!props.hasKey && !key.trim()}
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
