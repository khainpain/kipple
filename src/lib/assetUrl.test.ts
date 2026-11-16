import { afterEach, describe, expect, it } from "vitest";
import { publicAssetUrl, setRemoteAssets, shownAssetUrl } from "./assetUrl";

describe("publicAssetUrl (pictures a page names, shown straight in the app)", () => {
  it("keeps ordinary web addresses and data/blob pictures", () => {
    for (const u of ["https://cdn.example.com/a.jpg", "http://example.org/favicon.ico", "data:image/png;base64,AAAA", "blob:https://x/1"])
      expect(publicAssetUrl(u)).toBe(u);
  });

  it("drops addresses inside the user's network and odd schemes", () => {
    for (const u of [
      "http://192.168.0.1/cgi-bin/reboot",
      "http://127.0.0.1:8080/admin",
      "http://localhost/x",
      "http://10.0.0.5/",
      "http://172.20.1.1/",
      "http://169.254.169.254/latest",
      "http://0.0.0.0/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://[::ffff:192.168.0.1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://router/",
      "http://nas.local/",
      "http://fritz.box/",
      "http://printer.lan/",
      "http://x.home.arpa/",
      "http://svc.internal/",
      "file:///C:/Windows/win.ini",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(publicAssetUrl(u), u).toBeUndefined();
    expect(publicAssetUrl(undefined)).toBeUndefined();
  });
});

describe("shownAssetUrl (link previews switched off)", () => {
  afterEach(() => setRemoteAssets(true));

  it("shows no picture from the web while link previews are off", () => {
    setRemoteAssets(false);
    for (const u of ["https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", "https://cdn.example.com/og.jpg", "https://www.youtube.com/favicon.ico"])
      expect(shownAssetUrl(u)).toBeUndefined();
  });

  it("keeps pictures already on the device (data/blob) while link previews are off", () => {
    setRemoteAssets(false);
    for (const u of ["data:image/jpeg;base64,AAAA", "blob:https://x/1"]) expect(shownAssetUrl(u)).toBe(u);
  });

  it("shows public web pictures again when link previews are on, still without local addresses", () => {
    setRemoteAssets(true);
    expect(shownAssetUrl("https://cdn.example.com/og.jpg")).toBe("https://cdn.example.com/og.jpg");
    expect(shownAssetUrl("http://192.168.0.1/x.png")).toBeUndefined();
  });
});
