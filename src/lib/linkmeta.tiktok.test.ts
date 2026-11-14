import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewResponse } from "../platform/types";

const calls: string[] = [];
let answers: Record<string, PreviewResponse> = {};

vi.mock("@platform", () => ({
  platform: {
    httpFetch: async () => {
      throw new Error("not used");
    },
    previewFetch: async (url: string) => {
      calls.push(url);
      const a = Object.entries(answers).find(([k]) => url.startsWith(k));
      if (!a) throw new Error(`unexpected ${url}`);
      return a[1];
    },
  },
}));

const { fetchLinkMeta } = await import("./linkmeta");

const ok = (url: string, contentType: string, body: string): PreviewResponse => ({ status: 200, url, contentType, body: btoa(body) });
const FULL = "https://www.tiktok.com/@chef.anna/video/7234567890123456789";
const OEMBED = JSON.stringify({ title: "Pasta in 10 minutes", author_name: "Chef Anna", thumbnail_url: "https://p16.tiktokcdn.com/cover.jpeg" });

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe("TikTok previews", () => {
  it("takes title, author and cover from TikTok's oEmbed", async () => {
    answers = { "https://www.tiktok.com/oembed": ok("https://www.tiktok.com/oembed", "application/json", OEMBED), "https://p16.tiktokcdn.com/": ok("https://p16.tiktokcdn.com/cover.jpeg", "text/plain", "") };
    const m = await fetchLinkMeta(FULL);
    expect(m).toMatchObject({ url: FULL, title: "Pasta in 10 minutes", description: "Chef Anna", siteName: "TikTok" });
    expect(calls[0]).toBe(`https://www.tiktok.com/oembed?url=${encodeURIComponent(FULL)}`);
  });

  it("follows a short link to the video's address and keeps it", async () => {
    answers = {
      "https://vm.tiktok.com/": ok(`${FULL}?is_from_webapp=1`, "text/html", "<html></html>"),
      "https://www.tiktok.com/oembed": ok("https://www.tiktok.com/oembed", "application/json", OEMBED),
      "https://p16.tiktokcdn.com/": ok("https://p16.tiktokcdn.com/cover.jpeg", "text/plain", ""),
    };
    const m = await fetchLinkMeta("https://vm.tiktok.com/ZMabc/");
    expect(m.url).toBe(FULL);
    expect(m.title).toBe("Pasta in 10 minutes");
  });

  it("still saves the video's address when oEmbed fails", async () => {
    answers = { "https://vm.tiktok.com/": ok(FULL, "text/html", "<html></html>"), "https://www.tiktok.com/oembed": { status: 404, url: "x", contentType: "text/html", body: "" } };
    const m = await fetchLinkMeta("https://vm.tiktok.com/ZMabc/");
    expect(m).toMatchObject({ url: FULL, siteName: "TikTok" });
    expect(m.error).toBeUndefined();
  });
});
