import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cardEmbed, embedOf, headline, instagramCode, instantImage, isVideoLink, linkText, splitInstagram, tiktokId, tiktokShort, vimeoId, wantsImage, youtubeId } from "./embeds";

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
  it("recognises TikTok's short share links", () => {
    expect(tiktokShort("https://vm.tiktok.com/ZMabc/")).toBe(true);
    expect(tiktokShort("https://vt.tiktok.com/ZSabc/")).toBe(true);
    expect(tiktokShort("https://www.tiktok.com/t/ZTabc/")).toBe(true);
    expect(tiktokShort("https://www.tiktok.com/@someone/video/7234567890123456789")).toBe(false);
    expect(tiktokShort("https://example.com/t/abc")).toBe(false);
  });
  it("wants a cover for TikTok, short links included", () => {
    expect(wantsImage("https://www.tiktok.com/@someone/video/7234567890123456789")).toBe(true);
    expect(wantsImage("https://vm.tiktok.com/ZMabc/")).toBe(true);
    expect(wantsImage("https://www.tiktok.com/@someone")).toBe(false);
  });
  it("plays a short TikTok link through the address it led to", () => {
    const short = { urls: ["https://vm.tiktok.com/ZMabc/"], link: { url: "https://www.tiktok.com/@someone/video/7234567890123456789" } };
    expect(cardEmbed(short)).toMatchObject({ provider: "tiktok", src: "https://www.tiktok.com/player/v1/7234567890123456789?autoplay=1&rel=0" });
    expect(cardEmbed({ urls: ["https://vm.tiktok.com/ZMabc/"] })).toBeUndefined();
    expect(cardEmbed({ urls: ["https://youtu.be/dQw4w9WgXcQ"], link: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } })?.provider).toBe("youtube");
  });
  it("plays Rutube videos and shorts, private links with their key", () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(embedOf(`https://rutube.ru/video/${id}/`)).toMatchObject({ provider: "rutube", src: `https://rutube.ru/play/embed/${id}`, ratio: 16 / 9, video: true });
    expect(embedOf(`https://rutube.ru/shorts/${id}/`)?.ratio).toBe(9 / 16);
    expect(embedOf(`https://rutube.ru/video/private/${id}/?p=Xy_z-1`)?.src).toBe(`https://rutube.ru/play/embed/${id}?p=Xy_z-1`);
    expect(embedOf("https://rutube.ru/channel/123/")).toBeUndefined();
  });
  it("plays VK videos and clips", () => {
    expect(embedOf("https://vk.com/video-22822305_456242010")).toMatchObject({ provider: "vk", src: "https://vkvideo.ru/video_ext.php?oid=-22822305&id=456242010&hd=2&autoplay=1", ratio: 16 / 9 });
    expect(embedOf("https://vkvideo.ru/video123_456")?.src).toContain("oid=123&id=456");
    expect(embedOf("https://vk.com/clip-1_2")).toMatchObject({ provider: "vk", ratio: 9 / 16 });
    expect(embedOf("https://vk.com/wall-1?z=video-5_6%2Fpl_wall")?.src).toContain("oid=-5&id=6");
    expect(embedOf("https://vk.com/durov")).toBeUndefined();
  });
  it("plays Dailymotion", () => {
    expect(embedOf("https://www.dailymotion.com/video/x8abc12")).toMatchObject({ provider: "dailymotion", src: "https://geo.dailymotion.com/player.html?video=x8abc12", video: true });
    expect(embedOf("https://dai.ly/x8abc12")?.provider).toBe("dailymotion");
  });
  it("leaves other links alone", () => {
    expect(embedOf("https://example.com/video.mp4")).toBeUndefined();
    expect(embedOf(undefined)).toBeUndefined();
  });
});

describe("linkText", () => {
  it("shows a TikTok author as the author, as with YouTube", () => {
    expect(linkText({ url: "https://www.tiktok.com/@chef.anna/video/7234567890123456789", title: "Pasta", description: "Chef Anna" })).toEqual({ title: "Pasta", author: "Chef Anna" });
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

describe("players and the desktop CSP", () => {
  it("lets every player's site into a frame, and nothing more", () => {
    const conf = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    const frames = (conf.app.security.csp as string).match(/frame-src ([^;]+)/)![1].split(" ").filter((s) => s.startsWith("https://"));
    const samples = [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.instagram.com/reel/DAbc-12/",
      "https://vimeo.com/76979871",
      "https://www.tiktok.com/@a/video/7234567890123456789",
      "https://rutube.ru/video/a1b2c3d4e5f60718293a4b5c6d7e8f90/",
      "https://vk.com/video-1_2",
      "https://dai.ly/x8abc12",
    ];
    const origins = samples.map((u) => new URL(embedOf(u)!.src).origin);
    expect(frames.sort()).toEqual([...new Set(origins)].sort());
  });
});
