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
  it("never asks addresses inside the user's network", async () => {
    httpFetch.mockClear();
    expect(await probeLink("http://192.168.1.1/")).toEqual({ error: "skipped" });
    expect(httpFetch).not.toHaveBeenCalled();
  });
});
