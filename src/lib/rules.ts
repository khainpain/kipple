import type { Card } from "./types";

const CARD_NUMBER = /\b(?:\d[ -]?){13,19}\b/g;
const SECRET_PATTERNS: RegExp[] = [
  /(?:^|[^\p{L}])(?:парол[ья]|password|passwd|pwd|пин-?код|pin)\s*[:=]\s*\S+/iu,
  /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI / Anthropic style keys
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, // Telegram bot token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** 12 or 24 lowercase latin words and nothing else: looks like a crypto seed phrase. */
function looksLikeSeedPhrase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return (words.length === 12 || words.length === 24) && words.every((w) => /^[a-z]{3,8}$/.test(w));
}

export function isSensitive(text: string): boolean {
  if (!text) return false;
  if (SECRET_PATTERNS.some((re) => re.test(text))) return true;
  for (const m of text.match(CARD_NUMBER) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return looksLikeSeedPhrase(text);
}

export function isAutoJunk(card: Pick<Card, "kind" | "text" | "urls" | "media">): boolean {
  const text = card.text.trim();
  if (card.kind === "sticker") return true;
  if (card.kind === "text" && card.urls.length === 0) {
    if (text.length === 0) return true;
    if (text.length <= 3) return true;
    if (/^(test|тест|ok|ок|\.|\+|-)$/i.test(text)) return true;
  }
  return false;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
