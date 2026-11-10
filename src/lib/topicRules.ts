import type { Card } from "./types";
import { effectiveTopic, getTopicRules, topicName, type TopicRules } from "./library";
import { domainOf } from "./rules";
import { hostChain, siteMarkOf } from "./siteMarks";
import { builtinKeyNamed, builtinTopicOf } from "./siteTopics";

export interface RuleOffer {
  kind: "channel" | "site";
  /** Channel name or domain. */
  key: string;
  /** Other cards from there without a topic picked by hand: what the rule would move. */
  count: number;
}

/**
 * After cards are moved to a topic by hand: offer to send everything else from the same channel
 * (or, for links outside channels, the same site) there too. Nothing when the cards come from
 * different places, a rule is already there, or nothing else would move.
 */
export function ruleOffer(cards: Card[], ids: number[], topic: string, rules: TopicRules = getTopicRules()): RuleOffer | undefined {
  if (!topic || !ids.length) return undefined;
  const moved = new Set(ids);
  const picked = cards.filter((c) => moved.has(c.id));
  if (picked.length !== moved.size) return undefined;
  const channel = picked[0].forwardedFrom;
  const offer = channel ? channelOffer(picked, channel, rules) : siteOffer(picked, rules);
  if (!offer) return undefined;
  const name = topicName(topic);
  const count = cards.filter((c) => !moved.has(c.id) && !c.removed && c.user?.topic === undefined && offer.match(c) && effectiveTopic(c) !== name).length;
  return count ? { kind: offer.kind, key: offer.key, count } : undefined;
}

function channelOffer(picked: Card[], channel: string, rules: TopicRules) {
  if (picked.some((c) => c.forwardedFrom !== channel) || Object.prototype.hasOwnProperty.call(rules.channels, channel)) return undefined;
  return { kind: "channel" as const, key: channel, match: (c: Card) => c.forwardedFrom === channel };
}

function siteOffer(picked: Card[], rules: TopicRules) {
  const url = picked[0].urls[0];
  const site = url && domainOf(url);
  // YouTube, Instagram and the like carry anything, so "everything from there" means nothing.
  if (!site || (siteMarkOf(url) && !builtinTopicOf(url))) return undefined;
  if (picked.some((c) => c.forwardedFrom || domainOf(c.urls[0] ?? "") !== site)) return undefined;
  if (Object.prototype.hasOwnProperty.call(rules.sites, site)) return undefined;
  // What the rule itself would catch (library.ts ruleTopicOf): subdomains too, and cards whose channel has no rule.
  const own = (k: string) => Object.prototype.hasOwnProperty.call(rules.channels, k);
  return { kind: "site" as const, key: site, match: (c: Card) => !(c.forwardedFrom && own(c.forwardedFrom)) && hostChain(c.urls[0]).includes(site) };
}

/**
 * The rules left once a topic (as shown, after merges) is deleted, so it doesn't come back on new
 * cards: rules pointing at it go, and a built-in site topic of that name is switched off.
 */
export function withoutRulesTo(rules: TopicRules, topic: string): TopicRules {
  const keep = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, t]) => topicName(t) !== topic));
  const key = builtinKeyNamed(topic);
  const off = key && !rules.off?.includes(key) ? [...(rules.off ?? []), key] : rules.off;
  return { channels: keep(rules.channels), sites: keep(rules.sites), ...(off?.length && { off }) };
}

/** Rules after a topic is renamed, so new cards from there land in the new name. */
export function renameInRules(rules: TopicRules, from: string, to: string): TopicRules {
  const swap = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, t]) => [k, topicName(t) === from ? to : t]));
  return { ...rules, channels: swap(rules.channels), sites: swap(rules.sites) };
}
