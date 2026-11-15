import { describe, expect, it } from "vitest";
import { siteLetter, siteMarkOf } from "./siteMarks";

describe("siteMarkOf", () => {
  it("finds known sites and their subdomains", () => {
    expect(siteMarkOf("https://www.instagram.com/p/abc/")?.title).toBe("Instagram");
    expect(siteMarkOf("https://m.youtube.com/watch?v=1")?.title).toBe("YouTube");
    expect(siteMarkOf("https://youtu.be/1")?.title).toBe("YouTube");
    expect(siteMarkOf("https://twitter.com/a/status/1")?.title).toBe("X");
    expect(siteMarkOf("https://ru.wikipedia.org/wiki/A")?.title).toBe("Wikipedia");
    expect(siteMarkOf("https://t.me/channel/5")?.title).toBe("Telegram");
  });
  it("leaves unknown or look-alike hosts alone", () => {
    expect(siteMarkOf("https://example.com")).toBeUndefined();
    expect(siteMarkOf("https://notinstagram.com/x")).toBeUndefined();
    expect(siteMarkOf("https://instagram.com.evil.io/x")).toBeUndefined();
    expect(siteMarkOf("not a url")).toBeUndefined();
    expect(siteMarkOf(undefined)).toBeUndefined();
  });
});

describe("siteLetter", () => {
  it("is the first letter of the site's name, without www", () => {
    expect(siteLetter("https://www.coolors.co/palette")).toBe("C");
    expect(siteLetter("https://habr.com/ru/articles/1")).toBe("H");
  });
  it("is undefined where the name can't be read back (punycode), so the globe shows", () => {
    expect(siteLetter("https://пример.рф/")).toBeUndefined();
  });
  it("is undefined for a bad link", () => {
    expect(siteLetter("not a url")).toBeUndefined();
    expect(siteLetter(undefined)).toBeUndefined();
  });
});
