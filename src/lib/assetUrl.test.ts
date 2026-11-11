import { describe, expect, it } from "vitest";
import { publicAssetUrl } from "./assetUrl";

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
