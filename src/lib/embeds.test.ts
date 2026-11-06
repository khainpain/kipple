import { describe, expect, it } from "vitest";
import { instagramCode, instantImage, youtubeId } from "./embeds";

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/@channel", undefined],
    ["https://example.com/watch?v=dQw4w9WgXcQ", undefined],
  ])("%s", (url, id) => expect(youtubeId(url)).toBe(id));

  it("gives an instant thumbnail", () => expect(instantImage("https://youtu.be/dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"));
});

describe("instagramCode", () => {
  it.each([
    ["https://www.instagram.com/p/C8vE3mJsQ5_/?igsh=x", "C8vE3mJsQ5_"],
    ["https://instagram.com/reel/DAbc-12/", "DAbc-12"],
    ["https://www.instagram.com/someone/reel/DAbc-12/", "DAbc-12"],
    ["https://www.instagram.com/someone/", undefined],
  ])("%s", (url, code) => expect(instagramCode(url)).toBe(code));
});
