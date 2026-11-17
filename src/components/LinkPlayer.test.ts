import { describe, expect, it } from "vitest";
import { embedOf } from "../lib/embeds";
import { croppedRatio, frameAttrs, opensDirectly } from "./LinkPlayer";

describe("frameAttrs", () => {
  it("keeps a cropped player's page from scrolling: a Windows scrollbar narrows the video and shows Instagram's profile strip under it", () => {
    expect(frameAttrs(embedOf("https://www.instagram.com/reel/DAbc-12/")!)).toEqual({ scrolling: "no" });
    expect(frameAttrs(embedOf("https://www.instagram.com/p/C8vE3mJsQ5_/")!)).toEqual({ scrolling: "no" });
  });
  it("leaves other players as they are", () => {
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

describe("croppedRatio", () => {
  const ig = embedOf("https://www.instagram.com/p/C8vE3mJsQ5_/")!;
  // Heights Instagram's embed page reported for a 260px wide frame: 54 header + media + 154 likes and comment box.
  it("gives a 4:5 reel a 4:5 box", () => {
    expect(croppedRatio(ig, 533, 260)).toBeCloseTo(0.8, 2);
  });
  it("gives a square video or post a square box, so no white strip shows under it", () => {
    expect(croppedRatio(ig, 468, 260)).toBe(1);
  });
  it("ignores a height that leaves no media", () => {
    expect(croppedRatio(ig, 220, 260)).toBeUndefined();
    expect(croppedRatio(ig, 533, 0)).toBeUndefined();
  });
});
