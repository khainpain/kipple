import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "./_lib/quota.js";
import { GET, pickInstaller } from "./download.js";

const a = (name: string) => ({ name, browser_download_url: `https://example.com/${name}` });

describe("pickInstaller", () => {
  it("prefers the Kipple wrapper installer", () => {
    expect(pickInstaller([a("Kipple_0.1.15_x64-setup.exe"), a("Install-Kipple-0.1.15.exe"), a("latest.json")])).toBe(
      "https://example.com/Install-Kipple-0.1.15.exe",
    );
  });
  it("falls back to the NSIS setup, never the .sig", () => {
    expect(pickInstaller([a("Kipple_0.1.15_x64-setup.exe.sig"), a("Kipple_0.1.15_x64-setup.exe")])).toBe(
      "https://example.com/Kipple_0.1.15_x64-setup.exe",
    );
  });
  it("gives up when there is no installer", () => {
    expect(pickInstaller([a("latest.json")])).toBeNull();
  });
});

describe("GET /download", () => {
  const total = async () => (await redis([["GET", `kt:dl:${new Date().toISOString().slice(0, 10)}\u0000total`]]))[0] ?? 0;
  const click = (ip: string) => GET(new Request("https://kipple.test/download?src=test", { headers: { "x-real-ip": ip } }));

  beforeEach(() => {
    // GitHub unreachable in tests: the visitor goes to the releases page.
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("always redirects, but counts at most 10 downloads from one address a day", async () => {
    const before = await total();
    for (let i = 0; i < 14; i++) {
      const r = await click("192.0.2.10");
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toMatch(/^https:\/\/github\.com\//);
    }
    expect(await total()).toBe(before + 10);
    await click("192.0.2.11");
    expect(await total()).toBe(before + 11);
  });
});
