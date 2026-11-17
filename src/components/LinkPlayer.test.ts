import { describe, expect, it } from "vitest";
import { embedOf } from "../lib/embeds";
import { frameAttrs } from "./LinkPlayer";

describe("frameAttrs", () => {
  it("keeps a cropped player's page from scrolling: a Windows scrollbar narrows the video and shows Instagram's profile strip under it", () => {
    expect(frameAttrs(embedOf("https://www.instagram.com/reel/DAbc-12/")!)).toEqual({ scrolling: "no" });
  });
  it("leaves other players as they are", () => {
    expect(frameAttrs(embedOf("https://www.instagram.com/p/C8vE3mJsQ5_/")!)).toEqual({});
    expect(frameAttrs(embedOf("https://youtu.be/dQw4w9WgXcQ")!)).toEqual({});
  });
});
