import type { Action, CardKind } from "./types.js";

/** A made-up picture for a demo card (drawn in demo.ts, nothing is loaded). */
export type DemoScene = "hills" | "city" | "sea" | "plate" | "paper" | "screen";

/**
 * One message of the demo's Saved Messages, as short as it can be written by hand. The demo
 * library is a list of these in each interface language (`demo.cards` in src/i18n), so the
 * Russian demo is a Russian archive with its own sites, and the English one an English archive.
 */
export interface DemoSpec {
  /** Saved this many days ago. */
  d: number;
  /** Left out: a link when there is `url`, else a text note. */
  k?: CardKind;
  /** The message text (a caption, a note, a poll's lines). */
  t?: string;
  url?: string;
  /** The page's title, description and site name, as a fetched preview would give them. */
  title?: string;
  desc?: string;
  site?: string;
  /** The channel it was forwarded from. */
  from?: string;
  /** A topic the person picked by hand. Links to well-known sites get theirs from siteTopics.ts. */
  topic?: string;
  /** Starred. */
  pin?: boolean;
  /** The picture: of a photo, a video frame, or instead of the drawn link preview. */
  pic?: DemoScene;
  /** A portrait picture. */
  tall?: boolean;
  /** This many more pictures in the album. */
  album?: number;
  /** File name of a document, an audio or a video. */
  file?: string;
  /** Size in kilobytes. */
  kb?: number;
  /** Length in seconds. */
  dur?: number;
  /** "Check links" found the page gone. */
  broken?: boolean;
  /** For the frozen features (src/lib/features.ts): tags and a status, as the AI would have set them. */
  tags?: string[];
  status?: Action;
}
