import { describe, expect, it } from "vitest";
import { guardedFetch, needsPreview, PARSE_VERSION, PrivateHostError } from "./linkmeta";
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

describe("guardedFetch (desktop link previews)", () => {
  const ok = (_url: string) => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

  it("checks the host before fetching and follows redirects by hand, checking each hop", async () => {
    const asked: string[] = [];
    const fetched: Array<[string, unknown]> = [];
    const res = await guardedFetch("https://a.example/x", {}, {
      isPrivate: async (h) => (asked.push(h), false),
      fetch: async (u, init) => (fetched.push([u, (init as { maxRedirections?: number }).maxRedirections]), u.endsWith("/x") ? redirect("/y") : ok(u)),
    });
    expect(res.res).toBeInstanceOf(Response);
    expect(res.url).toBe("https://a.example/y");
    expect(asked).toEqual(["a.example", "a.example"]);
    expect(fetched).toEqual([["https://a.example/x", 0], ["https://a.example/y", 0]]);
  });

  it("refuses a redirect into the local network", async () => {
    const fetched: string[] = [];
    await expect(
      guardedFetch("https://a.example/", {}, {
        isPrivate: async (h) => h === "router.lan",
        fetch: async (u) => (fetched.push(u), redirect("http://router.lan/admin")),
      }),
    ).rejects.toBeInstanceOf(PrivateHostError);
    expect(fetched).toEqual(["https://a.example/"]);
  });

  it("refuses literal private hosts without asking, and gives up after 5 redirects", async () => {
    await expect(guardedFetch("http://192.168.0.1/", {}, { isPrivate: async () => false, fetch: async (u) => ok(u) })).rejects.toBeInstanceOf(PrivateHostError);
    let n = 0;
    await expect(guardedFetch("https://a.example/0", {}, { isPrivate: async () => false, fetch: async () => redirect(`/${++n}`) })).rejects.toThrow(/redirect/i);
    expect(n).toBe(6);
  });

  it("reports the final address", async () => {
    const r = await guardedFetch("https://a.example/x", {}, { isPrivate: async () => false, fetch: async (u) => (u.endsWith("/x") ? redirect("https://b.example/z") : ok(u)) });
    expect(r.url).toBe("https://b.example/z");
  });
});
