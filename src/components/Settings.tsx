import { useState } from "react";
import { platform } from "@platform";
import type { Settings } from "../lib/store";
import { LANGS, T, systemLang, type LangPref } from "../i18n";

export function SettingsDialog(props: {
  settings: Settings;
  hasKey: boolean;
  version: string;
  onSave: (s: Settings, apiKey: string | null) => void;
  onWipe: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(props.settings);
  const [key, setKey] = useState("");
  const L = T.settings;
  const systemName = LANGS.find((l) => l.key === systemLang())?.name ?? "";

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label={T.common.close}>
          ×
        </button>
        <h2>{L.title}</h2>

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
        <label className="check">
          <input type="checkbox" checked={s.aiImages} disabled={!s.aiEnabled} onChange={(e) => setS({ ...s, aiImages: e.target.checked })} />
          <span>{L.aiImages}</span>
        </label>
        <label className="check" hidden={!platform.canFetchLinks}>
          <input type="checkbox" checked={s.fetchLinks} onChange={(e) => setS({ ...s, fetchLinks: e.target.checked })} />
          {L.fetchLinks}
          {platform.kind === "web" ? L.fetchLinksWeb : ""}
        </label>

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
