import { describe, expect, it } from "vitest";
import { embedOf, headline, instagramCode, instantImage, isVideoLink, linkText, splitInstagram, tiktokId, vimeoId, youtubeId } from "./embeds";

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

describe("embedOf", () => {
  it("plays YouTube from the no-cookie domain, shorts upright", () => {
    expect(embedOf("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ provider: "youtube", ratio: 16 / 9, video: true });
    expect(embedOf("https://youtube.com/shorts/dQw4w9WgXcQ")?.ratio).toBe(9 / 16);
    expect(embedOf("https://youtu.be/dQw4w9WgXcQ")?.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  });
  it("uses Instagram's embed page; reels are videos, /p/ posts may not be", () => {
    expect(embedOf("https://www.instagram.com/reel/DAbc-12/?igsh=x")).toMatchObject({ provider: "instagram", src: "https://www.instagram.com/p/DAbc-12/embed/", video: true, measures: true });
    expect(embedOf("https://www.instagram.com/p/C8vE3mJsQ5_/")?.video).toBe(false);
    expect(isVideoLink("https://www.instagram.com/p/C8vE3mJsQ5_/")).toBe(false);
    expect(isVideoLink("https://instagram.com/reels/DAbc-12/")).toBe(true);
  });
  it("knows Vimeo and TikTok", () => {
    expect(vimeoId("https://vimeo.com/76979871")).toBe("76979871");
    expect(tiktokId("https://www.tiktok.com/@someone/video/7234567890123456789")).toBe("7234567890123456789");
    expect(tiktokId("https://vm.tiktok.com/ZMabc/")).toBeUndefined();
  });
  it("leaves other links alone", () => {
    expect(embedOf("https://example.com/video.mp4")).toBeUndefined();
    expect(embedOf(undefined)).toBeUndefined();
  });
});

describe("splitInstagram", () => {
  it("splits the page title", () => {
    expect(splitInstagram("Chef Anna on Instagram: \"Pasta in 10 minutes 🍝\nRecipe below\"", undefined)).toEqual({ author: "Chef Anna", caption: "Pasta in 10 minutes 🍝\nRecipe below" });
  });
  it("prefers the description, which isn't cut", () => {
    const d = "12K likes, 340 comments - chef.anna on May 1, 2024: \"Pasta in 10 minutes 🍝 full recipe\". ";
    expect(splitInstagram("Chef Anna on Instagram: \"Pasta in 10 min…\"", d)).toEqual({ author: "Chef Anna", caption: "Pasta in 10 minutes 🍝 full recipe" });
  });
  it("keeps an already clean caption", () => {
    expect(splitInstagram("chef.anna в Instagram", "Pasta in 10 minutes")).toEqual({ caption: "Pasta in 10 minutes" });
  });
});

describe("linkText", () => {
  it("turns an Instagram run-on title into a heading and a description", () => {
    const t = linkText({ url: "https://www.instagram.com/reel/DAbc-12/", title: "Chef Anna on Instagram: \"Pasta in 10 minutes. You only need three things, and the sauce is done while the water boils\"" });
    expect(t.author).toBe("Chef Anna");
    expect(t.title).toBe("Pasta in 10 minutes. You only need three things, and the sauce is done while the water…");
    expect(t.description).toMatch(/^Pasta in 10 minutes\. You only need three things.*boils$/);
  });
  it("doesn't repeat the heading in the description", () => {
    const t = linkText({ url: "https://www.instagram.com/reel/DAbc-12/", title: "Anna on Instagram: \"Pasta 🍝\nRecipe below\"" });
    expect(t).toEqual({ title: "Pasta 🍝", description: "Recipe below", author: "Anna" });
  });
  it("passes other sites through", () => {
    expect(linkText({ url: "https://example.com/a", title: "A", description: "B" })).toEqual({ title: "A", description: "B" });
  });
  it("cuts headings at a word", () => {
    expect(headline("first line\nsecond")).toBe("first line");
    expect(headline("word ".repeat(40), 20)).toBe("word word word word…");
  });
});
