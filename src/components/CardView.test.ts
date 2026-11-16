import { afterEach, describe, expect, it } from "vitest";
import { coverOf } from "./CardView";
import { setRemoteAssets } from "../lib/assetUrl";
import type { Card, Library } from "../lib/types";

const lib = { sourceDir: "", cards: [] } as unknown as Library;
const link = (url: string, image?: string): Card => ({
  id: 1,
  date: "2026-01-01",
  kind: "link",
  text: url,
  urls: [url],
  hashtags: [],
  link: image ? { url, image, fetchedAt: "2026-01-01" } : undefined,
});

describe("coverOf with link previews off", () => {
  afterEach(() => setRemoteAssets(true));

  it("doesn't ask YouTube for a cover", () => {
    setRemoteAssets(false);
    expect(coverOf(lib, link("https://youtu.be/dQw4w9WgXcQ")).src).toBeUndefined();
  });

  it("doesn't load a page picture fetched earlier from the web", () => {
    setRemoteAssets(false);
    expect(coverOf(lib, link("https://example.com/a", "https://cdn.example.com/og.jpg")).src).toBeUndefined();
  });

  it("still shows a cover kept inside the library (TikTok, Instagram)", () => {
    setRemoteAssets(false);
    expect(coverOf(lib, link("https://www.tiktok.com/@a/video/123456789", "data:image/jpeg;base64,AAAA")).src).toBe("data:image/jpeg;base64,AAAA");
  });

  it("shows the YouTube cover when previews are on", () => {
    setRemoteAssets(true);
    expect(coverOf(lib, link("https://youtu.be/dQw4w9WgXcQ")).src).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
});
