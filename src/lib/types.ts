import { T } from "../i18n";

export type CardKind =
  | "link"
  | "photo"
  | "video"
  | "animation"
  | "document"
  | "voice"
  | "video_note"
  | "audio"
  | "sticker"
  | "text"
  | "poll"
  | "location"
  | "contact";

export const ACTIONS = ["read_later", "idea", "reference", "todo", "junk"] as const;
export type Action = (typeof ACTIONS)[number];

/** Status name in the interface language. */
export function actionLabel(a: Action): string {
  return T.actions[a];
}

export interface MediaRef {
  /** Path relative to the export folder; undefined when the file was not exported. */
  path?: string;
  /** Telegram reported the file but it was not included in the export. */
  missing?: boolean;
  thumb?: string;
  width?: number;
  height?: number;
  mime?: string;
  size?: number;
  duration?: number;
  fileName?: string;
}

export interface LinkMeta {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  excerpt?: string;
  error?: string;
  fetchedAt: string;
}

export interface AiFields {
  title: string;
  summary: string;
  topic: string;
  tags: string[];
  action: Action;
  priority: 1 | 2 | 3;
  model: string;
  at: string;
  /** Language the AI wrote in ("ru", "en", or "source" for each message's own); missing on cards tagged before this was recorded. */
  lang?: string;
}

export interface UserFields {
  tags?: string[];
  action?: Action;
  topic?: string;
  title?: string;
  hidden?: boolean;
  pinned?: boolean;
  note?: string;
}

export interface Card {
  /** Telegram message id inside Saved Messages; stable across exports. */
  id: number;
  date: string;
  kind: CardKind;
  text: string;
  urls: string[];
  hashtags: string[];
  media?: MediaRef;
  /** Extra photos/videos when several messages form one album. */
  album?: MediaRef[];
  albumIds?: number[];
  forwardedFrom?: string;
  /** Looks like it contains a password, card number, key or seed phrase: never sent to AI. */
  sensitive?: boolean;
  /** Rule-based junk guess (empty, single sticker, etc.). */
  autoJunk?: boolean;
  /** Present in an earlier import but missing from the latest one. */
  removed?: boolean;
  link?: LinkMeta;
  /** Text of a nearby message, for photos and files sent without a caption. Derived, not saved. */
  context?: string;
  ai?: AiFields;
  user?: UserFields;
}

export interface Library {
  version: 1;
  chatName: string;
  sourceDir: string;
  importedAt: string;
  cards: Card[];
}

/** One user edit; the edit log is replayed on load and is what a future sync would carry. */
export interface EditEvent {
  t: string;
  id: number;
  patch: UserFields;
}
