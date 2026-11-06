import { useState } from "react";
import { platform } from "@platform";
import type { Settings } from "../lib/store";

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

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label="Закрыть">
          ×
        </button>
        <h2>Настройки</h2>

        <label>
          Ключ Anthropic API {props.hasKey && <span className="ok">сохранён</span>}
          <input type="password" placeholder={props.hasKey ? "•••••••• (оставь пустым, чтобы не менять)" : "sk-ant-..."} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <p className="hint">
          {platform.kind === "web" ? "В веб-версии ключ хранится в этом браузере." : "Ключ хранится в диспетчере учётных данных Windows, не в файле."} Получить ключ:{" "}
          <a href="#" onClick={(e) => (e.preventDefault(), platform.openUrl("https://console.anthropic.com/settings/keys"))}>
            console.anthropic.com
          </a>
          . Разметка 10 тыс. сообщений стоит примерно $1–2.
        </p>

        <label className="check">
          <input type="checkbox" checked={s.aiEnabled} onChange={(e) => setS({ ...s, aiEnabled: e.target.checked })} />
          AI-разметка (в Anthropic уходит только текст сообщений и описания страниц; медиа и «чувствительные» сообщения не отправляются)
        </label>
        <label className="check" hidden={!platform.canFetchLinks}>
          <input type="checkbox" checked={s.fetchLinks} onChange={(e) => setS({ ...s, fetchLinks: e.target.checked })} />
          Загружать превью ссылок (заголовок, картинка, описание страницы)
          {platform.kind === "web" ? ". В веб-версии страницы загружаются через сервер этого сайта, туда уходит только сама ссылка" : ""}
        </label>

        {props.version && <p className="hint">Версия {props.version}</p>}

        <div className="dialog-buttons">
          <button className="danger" onClick={() => confirm("Удалить библиотеку и все правки с этого компьютера? Сам экспорт Telegram не пострадает.") && props.onWipe()}>
            Удалить все данные
          </button>
          <span className="spacer" />
          <button onClick={props.onClose} className="secondary">
            Отмена
          </button>
          <button onClick={() => props.onSave(s, key.trim() || null)}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
