import { useEffect, useState } from "react";
import { platform } from "@platform";
import type { Settings } from "../lib/store";
import { AI_MODELS, aiModelOf, builtinUsage, costEstimate } from "../lib/ai";
import { getInstallId } from "../lib/secrets";
import { pingPreview, telemetryEndpoint, telemetrySupported } from "../lib/telemetry";
import { setThemePref, THEME_ICONS, THEME_LABELS, THEME_PREFS, useThemePref } from "../lib/theme";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { AiConsentDialog } from "./AiConsent";
import { cleanRules, topicName, type TopicRules } from "../lib/library";
import { Done, HoldToConfirm, Switch } from "./Motion";
import "./Settings.css";
import { LANGS, T, systemLang, type LangPref } from "../i18n";
import { telegramErrorText } from "../lib/telegram";
import { REPLY_CLEANUPS, type ReplyCleanup } from "../lib/tgReplies";
import type { TelegramApi, TelegramStatus } from "../platform/types";
import { useEscape } from "./useEscape";

export function SettingsDialog(props: {
  settings: Settings;
  /** Topic rules as they are now; removing one saves at once, apart from the dialog's Save. */
  rules: TopicRules;
  onRemoveRule: (kind: "channel" | "site", key: string) => void;
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
  useEscape(props.onClose);
  const [s, setS] = useState(props.settings);
  const [key, setKey] = useState("");
  /** Ticking AI on without an earlier consent first shows the consent dialog. */
  const [asking, setAsking] = useState(false);
  const [showPing, setShowPing] = useState(false);
  const theme = useThemePref();
  const L = T.settings;
  const systemName = LANGS.find((l) => l.key === systemLang())?.name ?? "";
  // How much of today's built-in allowance is used; only asked when AI is on and there is no own key
  // (in no-AI mode the app doesn't send anything to the Kipple server for AI).
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

  const model = aiModelOf(s.aiModel);

  const rules = cleanRules(props.rules);
  const ruleRows = [
    ...Object.entries(rules.channels).map(([key, topic]) => ({ field: "channels" as const, key, topic, label: T.rules.channel(key) })),
    ...Object.entries(rules.sites).map(([key, topic]) => ({ field: "sites" as const, key, topic, label: T.rules.site(key) })),
  ];

  return (
    <>
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings s2" onClick={(e) => e.stopPropagation()}>
        <header className="s2-head">
          <span className="s2-head-icon">
            <Icon name="settings" size={18} />
          </span>
          <div>
            <h2>{L.title}</h2>
            <p>{platform.kind === "web" ? L.subtitleWeb : L.subtitle}</p>
          </div>
          <button className="close" onClick={props.onClose} aria-label={T.common.close}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="s2-body">
          <h3 className="s2-sec">{L.secAppearance}</h3>
          <div className="s2-panel">
            <div className="s2-row">
              <div className="s2-text">
                <b id="theme-label">{T.theme.label}</b>
              </div>
              <div className="segmented labeled" role="radiogroup" aria-labelledby="theme-label">
                {THEME_PREFS.map((t) => (
                  <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => setThemePref(t)}>
                    <Icon name={THEME_ICONS[t]} size={14} /> {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="s2-row">
              <div className="s2-text">
                <b id="s2-lang-label">{L.language}</b>
              </div>
              <Select<LangPref>
                labelledBy="s2-lang-label"
                value={s.language}
                options={[{ value: "auto", label: L.languageAuto(systemName) }, ...LANGS.map((l) => ({ value: l.key as LangPref, label: l.name }))]}
                onChange={(v) => setS({ ...s, language: v })}
              />
            </div>
          </div>

          <h3 className="s2-sec">{L.secAi}</h3>
          <div className="s2-panel">
            <div className="s2-row">
              <div className="s2-text">
                <b>{L.aiTitle}</b>
                <small>{s.aiEnabled ? L.aiDesc : L.aiOff}</small>
              </div>
              <Switch
                label={L.aiTitle}
                checked={s.aiEnabled}
                onChange={(on) =>
                  on
                    ? s.aiConsentAt
                      ? setS({ ...s, aiEnabled: true })
                      : setAsking(true)
                    : // Turning AI off also takes back the consent, so turning it on again asks again.
                      setS({ ...s, aiEnabled: false, aiImages: false, aiConsentAt: undefined, aiAsked: true })
                }
              />
            </div>
            {s.aiEnabled && (
              <>
                <fieldset className="s2-row s2-choice">
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
                <fieldset className="s2-row s2-choice">
                  <legend>{L.aiModel}</legend>
                  {AI_MODELS.map((m) => (
                    <label key={m} className="check">
                      <input type="radio" name="ai-model" checked={model === m} onChange={() => setS({ ...s, aiModel: m })} />
                      <span>
                        <b>{L.aiModels[m].name}</b> · {L.aiModels[m].hint}
                      </span>
                    </label>
                  ))}
                  {model !== aiModelOf(props.settings.aiModel) && <p className="hint">{L.aiModelNote}</p>}
                  {props.retagCount > 0 && (
                    <div>
                      <button
                        className="secondary small"
                        onClick={() => {
                          if (confirm(L.retagConfirm(props.retagCount, L.aiModels[model].name, costEstimate(props.retagCount, model)))) props.onRetag(s, key.trim() || null);
                        }}
                      >
                        {L.retag}
                      </button>
                    </div>
                  )}
                </fieldset>
                <div className="s2-row">
                  <div className="s2-text">
                    <b>{L.aiImagesTitle}</b>
                    <small>{L.aiImages}</small>
                  </div>
                  <Switch label={L.aiImagesTitle} checked={s.aiImages} onChange={(on) => setS({ ...s, aiImages: on })} />
                </div>
              </>
            )}
            <div className="s2-row s2-key">
              <div className="s2-text">
                <b>
                  {L.apiKey} {props.hasKey && <Done label={L.keySaved} />}
                </b>
                <small>{L.ownKeyWhy}</small>
              </div>
              <div className="s2-key-input">
                <Icon name="lock" size={14} />
                <input type="password" aria-label={L.apiKey} placeholder={props.hasKey ? L.keyKeep : "sk-ant-..."} value={key} onChange={(e) => setKey(e.target.value)} />
                {props.hasKey && (
                  <button className="secondary small" onClick={() => confirm(L.forgetKeyConfirm) && props.onForgetKey()}>
                    {L.forgetKey}
                  </button>
                )}
              </div>
              <small className="s2-note">
                {platform.kind === "web" ? L.keyWhereWeb : L.keyWhereDesktop} {L.keyGet}{" "}
                <a href="#" onClick={(e) => (e.preventDefault(), platform.openUrl("https://console.anthropic.com/settings/keys"))}>
                  console.anthropic.com
                </a>
                {L.keyCost}
              </small>
            </div>
            {s.aiEnabled && (
              <div className="s2-row s2-foot">
                <Icon name="sparkle" size={15} />
                <span>
                  {L.aiModelLine(L.aiModels[model].name, L.aiModels[model].hint)}
                  {". "}
                  {props.hasKey ? L.aiViaOwnKey : L.aiViaBuiltin}
                  {!props.hasKey && used !== null && <> {L.builtinUsed(Math.round(used * 100))}</>}
                </span>
              </div>
            )}
          </div>

          <h3 className="s2-sec">{T.rules.title}</h3>
          <div className="s2-panel">
            <div className="s2-row">
              <div className="s2-text">
                <small>{T.rules.desc}</small>
              </div>
            </div>
            {ruleRows.length === 0 && (
              <div className="s2-row">
                <small className="s2-note">{T.rules.empty}</small>
              </div>
            )}
            {ruleRows.map((r) => (
              <div key={`${r.field}:${r.key}`} className="s2-row s2-icon-row">
                <Icon name={r.field === "channels" ? "send" : "link"} size={16} />
                <div className="s2-text">
                  <b>{r.label}</b>
                  <small>→ {topicName(r.topic)}</small>
                </div>
                <button className="icon-btn" aria-label={T.rules.remove(r.label)} title={T.rules.remove(r.label)} onClick={() => props.onRemoveRule(r.field === "channels" ? "channel" : "site", r.key)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>

          {platform.canFetchLinks && (
            <>
              <h3 className="s2-sec">{L.secLinks}</h3>
              <div className="s2-panel">
                <div className="s2-row">
                  <div className="s2-text">
                    <b>{L.fetchLinksTitle}</b>
                    <small>
                      {L.fetchLinksDesc}
                      {platform.kind === "web" ? L.fetchLinksWeb : ""}
                    </small>
                  </div>
                  <Switch label={L.fetchLinksTitle} checked={s.fetchLinks} onChange={(on) => setS({ ...s, fetchLinks: on })} />
                </div>
              </div>
            </>
          )}

          {platform.telegram && (
            <>
              <h3 className="s2-sec">{L.secTelegram}</h3>
              <div className="s2-panel">
                <div className="s2-row">
                  <div className="s2-text">
                    <b id="s2-replies-label">{L.replyCleanupTitle}</b>
                    <small>{L.replyCleanupDesc}</small>
                  </div>
                  <Select<ReplyCleanup>
                    labelledBy="s2-replies-label"
                    value={s.replyCleanup}
                    options={REPLY_CLEANUPS.map((v) => ({ value: v, label: L.replyCleanup[v] }))}
                    onChange={(v) => setS({ ...s, replyCleanup: v })}
                  />
                </div>
              </div>
            </>
          )}

          <h3 className="s2-sec">{L.secData}</h3>
          <div className="s2-panel">
            <div className="s2-row s2-icon-row">
              <Icon name="folder" size={16} />
              <div className="s2-text">
                <b>{L.dataLibrary}</b>
                {platform.kind === "web" ? <small>{L.dataWhereWeb}</small> : <code>%APPDATA%\io.getkipple.app</code>}
              </div>
            </div>
            <div className="s2-row s2-icon-row">
              <Icon name="photo" size={16} />
              <div className="s2-text">
                <b>{L.dataMedia}</b>
                <small>{L.dataMediaDesc}</small>
              </div>
            </div>
            {platform.telegram && <BackupRow tg={platform.telegram} />}
            <div className="s2-row s2-icon-row danger">
              <Icon name="trash" size={16} />
              <div className="s2-text">
                <b>{L.wipe}</b>
                <small>{L.wipeDesc}</small>
              </div>
              <HoldToConfirm doneLabel={L.wipeDone} onHold={props.onWipe}>
                {L.wipeHold}
              </HoldToConfirm>
            </div>
          </div>

          {telemetrySupported() && (
            <>
              <h3 className="s2-sec">{L.secStats}</h3>
              <div className="s2-panel">
                <div className="s2-row">
                  <div className="s2-text">
                    <b>{L.statsTitle}</b>
                    <small>{L.statsDesc}</small>
                  </div>
                  <Switch label={L.statsTitle} checked={s.telemetry} onChange={(on) => setS({ ...s, telemetry: on })} />
                </div>
                <div className="s2-row s2-stats">
                  <button className="link-btn" onClick={() => setShowPing(!showPing)}>
                    {showPing ? L.statsHide : L.statsShow}
                  </button>
                  {showPing && (
                    <pre className="s2-ping">
                      {`POST ${telemetryEndpoint()}\n`}
                      {JSON.stringify({ ...pingPreview(), v: props.version }, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}

          {platform.telegram && (
            <details className="s2-advanced">
              <summary>
                <Icon name="right" size={14} className="s2-chev" />
                <b>{L.advanced}</b>
                <small>{L.advancedHint}</small>
              </summary>
              <TelegramKey tg={platform.telegram} />
            </details>
          )}
        </div>

        <footer className="s2-buttons">
          <span className="s2-version">{props.version ? L.version(props.version) : ""}</span>
          <span className="spacer" />
          <button onClick={props.onClose} className="secondary">
            {T.common.cancel}
          </button>
          <button onClick={() => props.onSave(s, key.trim() || null)}>{T.common.save}</button>
        </footer>
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
      <span className="s2-tg-title">
        <b>{L.tgApi}</b> {status?.customApi && <Done label={L.tgApiCustom} />}
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
        <button className="small" disabled={busy || !apiId.trim() || !apiHash.trim()}>
          {L.tgApiSave}
        </button>
      </div>
      {note && <p className="hint">{note}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** The local backup of Saved Messages: how big it is and where (src-tauri telegram.rs, "Local backup"). */
function BackupRow({ tg }: { tg: NonNullable<typeof platform.telegram> }) {
  const L = T.settings;
  const [info, setInfo] = useState<{ dir: string; messages: number } | null>(null);
  useEffect(() => {
    tg.backupInfo().then(setInfo, () => setInfo(null));
  }, [tg]);
  if (!info) return null;
  return (
    <div className="s2-row s2-icon-row">
      <Icon name="lock" size={16} />
      <div className="s2-text">
        <b>{L.backupTitle}</b>
        <small>{L.backupDesc(info.messages)}</small>
      </div>
      <button className="link-btn" onClick={() => void tg.openBackup(info.dir).catch(() => undefined)}>
        {L.backupOpen}
      </button>
    </div>
  );
}
