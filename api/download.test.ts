import { describe, expect, it } from "vitest";
import { pickInstaller } from "./download";

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
