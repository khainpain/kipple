import { describe, expect, it } from "vitest";
import { embedOf } from "../lib/embeds";
import { frameAttrs, opensDirectly } from "./LinkPlayer";

describe("frameAttrs", () => {
  it("keeps a cropped player's page from scrolling: a Windows scrollbar narrows the video and shows Instagram's profile strip under it", () => {
    expect(frameAttrs(embedOf("https://www.instagram.com/reel/DAbc-12/")!)).toEqual({ scrolling: "no" });
  });
  it("leaves other players as they are", () => {
    expect(frameAttrs(embedOf("https://www.instagram.com/p/C8vE3mJsQ5_/")!)).toEqual({});
    expect(frameAttrs(embedOf("https://youtu.be/dQw4w9WgXcQ")!)).toEqual({});
  });
});

describe("opensDirectly", () => {
  const reel = embedOf("https://www.instagram.com/reel/DAbc-12/")!;
  it("shows Instagram's own player at once when link previews are on: it can't be started for the user, so our cover would cost a second click", () => {
    expect(opensDirectly(reel, true)).toBe(true);
  });
  it("keeps our cover when link previews are off: nothing loads from Instagram until play is pressed", () => {
    expect(opensDirectly(reel, false)).toBe(false);
  });
  it("keeps our cover for players that start on the first click", () => {
    expect(opensDirectly(embedOf("https://youtu.be/dQw4w9WgXcQ")!, true)).toBe(false);
  });
});
