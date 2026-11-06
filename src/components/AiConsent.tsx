import { T } from "../i18n";

/**
 * Asks before anything goes to the AI: says plainly that card text leaves the computer for
 * Anthropic (through the Kipple server unless the user has their own key), and offers to stay
 * without AI. Nothing is sent until the user presses Allow.
 */
export function AiConsentDialog(props: { hasKey: boolean; onAllow: () => void; onDecline: () => void }) {
  const L = T.aiConsent;
  return (
    <div className="modal-backdrop" onClick={(e) => (e.stopPropagation(), props.onDecline())}>
      <div className="modal ai-consent" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ai-consent-title">{L.title}</h2>
        <p>{L.what}</p>
        <ul>
          <li>{L.sent}</li>
          <li>{props.hasKey ? L.routeOwnKey : L.routeBuiltin}</li>
          <li>{L.anthropic}</li>
          <li>{L.never}</li>
        </ul>
        <p className="hint">{L.without}</p>
        <div className="dialog-buttons">
          <span className="spacer" />
          <button className="secondary" onClick={props.onDecline}>
            {L.decline}
          </button>
          <button onClick={props.onAllow}>{L.allow}</button>
        </div>
      </div>
    </div>
  );
}
