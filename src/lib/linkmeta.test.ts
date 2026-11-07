import { describe, expect, it } from "vitest";
import { needsPreview, PARSE_VERSION } from "./linkmeta";
import type { Card, LinkMeta } from "./types";

const card = (link?: Partial<LinkMeta>, url = "https://example.com/a"): Card => ({
  id: 1,
  date: "2026-11-01T00:00:00Z",
  kind: "link",
  text: url,
  urls: [url],
  hashtags: [],
  link: link && { url, fetchedAt: new Date().toISOString(), ...link },
});

describe("needsPreview", () => {
  it("fetches links never fetched", () => {
    expect(needsPreview(card())).toBe(true);
  });

  it("tries once more for links an older version left without a picture", () => {
    expect(needsPreview(card({ title: "A page" }))).toBe(true);
    expect(needsPreview(card({ title: "A page", error: "HTTP 403" }))).toBe(true);
    expect(needsPreview(card({ title: "A page", v: PARSE_VERSION }))).toBe(false);
  });

  it("leaves links with a picture and skipped ones alone", () => {
    expect(needsPreview(card({ image: "https://example.com/og.png" }))).toBe(false);
    expect(needsPreview(card({ error: "skipped" }))).toBe(false);
  });
});
