import { useMemo, useState } from "react";
import { mergeAlias, type Aliases } from "../lib/library";
import { suggestMerges, type MergeSuggestion } from "../lib/tidy";
import { FEATURES } from "../lib/features";
import { T, formatNumber } from "../i18n";
import { Icon } from "./Icon";
import { useEscape } from "./useEscape";

export type TidyKind = "topics" | "tags";

/**
 * "Tidy up": suggestions to merge topics or tags that name the same thing, found locally
 * (spelling, plural, typos) and, on request, by the AI (synonyms, translations). A merge
 * only maps names, so every one can be undone from the list below.
 */
export function TidyDialog(props: {
  /** Name → cards, as shown now (after earlier merges). */
  topics: Map<string, number>;
  tags: Map<string, number>;
  aliases: Aliases;
  initial?: TidyKind;
  /** Undefined when AI is off or unavailable (demo). */
  askAi?: (kind: TidyKind, counts: Map<string, number>) => Promise<Array<{ into: string; from: string[] }>>;
  onChange: (a: Aliases) => void;
  onClose: () => void;
}) {
  useEscape(props.onClose);
  const L = T.tidy;
  const [kind, setKind] = useState<TidyKind>(FEATURES.tags ? (props.initial ?? "tags") : "topics");
  const [aiGroups, setAiGroups] = useState<Record<TidyKind, Array<{ into: string; from: string[] }>>>({ topics: [], tags: [] });
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which name to keep, when the user picked another one than suggested; keyed by the suggested one.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const counts = kind === "tags" ? props.tags : props.topics;
  const map = props.aliases[kind];
  const show = (n: string) => (kind === "tags" ? `#${n}` : n);

  const suggestions = useMemo(() => {
    const local = suggestMerges(counts);
    const seen = new Set(local.flatMap((s) => [s.into, ...s.from]));
    // AI groups that still apply (names may have been merged since) and don't overlap the local ones.
    for (const g of aiGroups[kind]) {
      const names = [g.into, ...g.from].filter((n) => counts.has(n) && !seen.has(n));
      if (names.length < 2) continue;
      names.sort((a, b) => (a === g.into ? -1 : b === g.into ? 1 : counts.get(b)! - counts.get(a)!));
      const [into, ...from] = names;
      names.forEach((n) => seen.add(n));
      local.push({ into, from, cards: from.reduce((s, f) => s + counts.get(f)!, 0), ai: true } as MergeSuggestion & { ai: boolean });
    }
    return local as Array<MergeSuggestion & { ai?: boolean }>;
  }, [counts, aiGroups, kind]);

  const rare = useMemo(() => [...counts.values()].filter((n) => n === 1).length, [counts]);
  const merged = Object.entries(map).sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : 1));

  function target(s: MergeSuggestion) {
    return picked[s.into] ?? s.into;
  }

  function apply(list: MergeSuggestion[]) {
    let m = map;
    for (const s of list) {
      const into = target(s);
      m = mergeAlias(m, [s.into, ...s.from].filter((n) => n !== into), into);
    }
    props.onChange({ ...props.aliases, [kind]: m });
  }

  function undo(name: string) {
    const m = { ...map };
    delete m[name];
    props.onChange({ ...props.aliases, [kind]: m });
  }

  async function ask() {
    if (!props.askAi) return;
    setAsking(true);
    setError(null);
    try {
      const groups = await props.askAi(kind, counts);
      setAiGroups((g) => ({ ...g, [kind]: groups }));
      if (!groups.length) setError(L.aiNothing);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal tidy" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={props.onClose} aria-label={T.common.close}>
          ×
        </button>
        <h2>{L.title}</h2>
        <p className="hint">{L.intro}</p>

        <div className="segmented labeled" role="radiogroup">
          {(FEATURES.tags ? (["topics", "tags"] as const) : (["topics"] as const)).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
              {k === "tags" ? T.sidebar.tags : T.sidebar.topics} <small>{formatNumber((k === "tags" ? props.tags : props.topics).size)}</small>
            </button>
          ))}
        </div>

        <div className="tidy-bar">
          <span className="hint">
            {suggestions.length ? L.found(suggestions.length) : L.none}
            {kind === "tags" && rare > 0 && <> {L.rare(rare)}</>}
          </span>
          <span className="spacer" />
          {props.askAi && (
            <button className="secondary small-btn" onClick={() => void ask()} disabled={asking || counts.size < 2} title={L.askAiHint}>
              <Icon name="sparkle" size={14} /> {asking ? L.asking : L.askAi}
            </button>
          )}
          {suggestions.length > 1 && (
            <button className="small-btn" onClick={() => apply(suggestions)}>
              {L.mergeAll}
            </button>
          )}
        </div>
        {error && <p className="hint">{error}</p>}

        {suggestions.length > 0 && (
          <ul className="tidy-list">
            {suggestions.map((s) => {
              const into = target(s);
              return (
                <li key={s.into}>
                  <div className="tidy-names">
                    {[s.into, ...s.from].map((n) => (
                      <button key={n} className={`tidy-name${n === into ? " keep" : ""}`} onClick={() => setPicked((p) => ({ ...p, [s.into]: n }))} title={n === into ? L.keep : L.makeMain}>
                        {show(n)} <small>{formatNumber(counts.get(n) ?? 0)}</small>
                      </button>
                    ))}
                    {s.ai && (
                      <span className="tidy-ai" title={L.fromAi}>
                        <Icon name="sparkle" size={12} />
                      </span>
                    )}
                  </div>
                  <button className="secondary small-btn" onClick={() => apply([s])}>
                    {L.merge(show(into))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {merged.length > 0 && (
          <>
            <h3 className="tidy-h">{L.merged}</h3>
            <ul className="tidy-list merged">
              {merged.map(([from, into]) => (
                <li key={from}>
                  <span>
                    {show(from)} → <b>{show(into)}</b>
                  </span>
                  <button className="link-btn" onClick={() => undo(from)}>
                    {L.undo}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
