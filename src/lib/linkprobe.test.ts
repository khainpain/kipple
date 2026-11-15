import { describe, expect, it, vi } from "vitest";

// The browser route: every request goes through /api/fetch, which marks a site's own answer with x-final-url.
const httpFetch = vi.fn();
vi.mock("@platform", () => ({ platform: { httpFetch: (...a: unknown[]) => httpFetch(...a) } }));
const { probeLink } = await import("./linkmeta");

describe("probeLink", () => {
  it("passes on the site's own status", async () => {
    httpFetch.mockResolvedValueOnce(new Response("", { status: 404, headers: { "x-final-url": "https://a.example/x" } }));
    expect(await probeLink("https://a.example/x")).toEqual({ status: 404 });
  });
  it("an answer that isn't the site's (the proxy itself, or no proxy at all) tells nothing", async () => {
    httpFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const r = await probeLink("https://a.example/x");
    expect(r.status).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
  it("a 404 that is just the site's app shell (the same page as its home) tells nothing", async () => {
    const shell = "<!doctype html><div id=root></div><script type=module src=/app.js></script>";
    httpFetch
      .mockResolvedValueOnce(new Response(shell, { status: 404, headers: { "x-final-url": "https://spa.example/pricing/", "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(shell, { status: 200, headers: { "x-final-url": "https://spa.example/", "content-type": "text/html" } }));
    const r = await probeLink("https://spa.example/pricing/");
    expect(r.status).toBeUndefined();
    expect(r.error).toMatch(/app shell/);
  });
  it("a real 404 page, unlike the home page, stays a 404", async () => {
    httpFetch
      .mockResolvedValueOnce(new Response("<h1>Not found</h1>", { status: 404, headers: { "x-final-url": "https://b.example/x", "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<h1>Welcome</h1>", { status: 200, headers: { "x-final-url": "https://b.example/", "content-type": "text/html" } }));
    expect(await probeLink("https://b.example/x")).toEqual({ status: 404 });
  });
  it("never asks addresses inside the user's network", async () => {
    httpFetch.mockClear();
    expect(await probeLink("http://192.168.1.1/")).toEqual({ error: "skipped" });
    expect(httpFetch).not.toHaveBeenCalled();
  });
});
