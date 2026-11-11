/**
 * MVP freeze (the MVP list of 2026-11-11). A frozen feature keeps its code and only its entry
 * points are hidden; turn a flag on to bring the feature back. These are not user settings.
 */
export const FEATURES = {
  /** AI topics, tags and titles, the built-in key, the model picker. Off also closes `aiAllowed`. */
  ai: false,
  /** "Three for today". */
  today: false,
  /** Board views other than the even grid, and the menu of card fields. */
  views: false,
  /** Ways to open a card other than the centred one. */
  openModes: false,
  /** Statuses other than junk: read later, idea, reference, to do. */
  statuses: false,
  /** Tags and "Tidy up" for tags. */
  tags: false,
  /** The old "Send to Telegram" into a group with topics. */
  forumSend: false,
};
