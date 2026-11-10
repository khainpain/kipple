import { describe, expect, it } from "vitest";
import { needsPreview, PARSE_VERSION, previewResponse } from "./linkmeta";
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

  it("tries a home-network or rate-limited link again after a day, not right away", () => {
    const fresh = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    for (const error of ["private", "HTTP 429", "HTTP 503"]) {
      expect(needsPreview(card({ error, fetchedAt: fresh, v: PARSE_VERSION }))).toBe(false);
      expect(needsPreview(card({ error, fetchedAt: old, v: PARSE_VERSION }))).toBe(true);
    }
  });
});

describe("previewResponse (desktop link previews)", () => {
  it("turns preview_fetch's answer into a Response with the final address", async () => {
    const res = previewResponse({ status: 200, url: "https://b.example/z", contentType: "text/html; charset=utf-8", body: btoa("<html>привет</html>".replace(/[^\x00-\x7f]/g, "")) });
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-final-url")).toBe("https://b.example/z");
    expect(await res.text()).toBe("<html></html>");
  });

  it("keeps bytes intact and copes with bodiless statuses", async () => {
    const bytes = new Uint8Array([0, 255, 128, 10]);
    const res = previewResponse({ status: 200, url: "https://a.example/i.png", contentType: "image/png", body: btoa(String.fromCharCode(...bytes)) });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(previewResponse({ status: 304, url: "https://a.example/", contentType: "", body: "" }).status).toBe(304);
    expect(previewResponse({ status: 404, url: "https://a.example/", contentType: "text/html", body: "" }).ok).toBe(false);
  });
});
