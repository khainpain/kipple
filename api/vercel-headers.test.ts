// The browser build's Content-Security-Policy is set in vercel.json; check it stays strict.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rule = { source: string; headers: { key: string; value: string }[] };
const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: Rule[] };

/** The CSP Vercel sends for a path (the last matching rule wins, as on Vercel). */
function cspFor(path: string): Map<string, string[]> | null {
  let value: string | null = null;
  for (const r of config.headers) {
    const re = new RegExp("^" + r.source.replace(/:path\*/g, ".*").replace(/\(\.\*\)/g, ".*") + "$");
    if (!re.test(path)) continue;
    const h = r.headers.find((h) => h.key.toLowerCase() === "content-security-policy");
    if (h) value = h.value;
  }
  if (!value) return null;
  return new Map(value.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
}

describe("vercel.json CSP", () => {
  for (const path of ["/app/", "/app/index.html", "/app/assets/index-abc.js"]) {
    it(`locks down the web app at ${path}`, () => {
      const csp = cspFor(path);
      expect(csp).not.toBeNull();
      expect(csp!.get("default-src")).toEqual(["'self'"]);
      expect(csp!.get("script-src")).toEqual(["'self'"]);
      expect(csp!.get("object-src")).toEqual(["'none'"]);
      expect(csp!.get("base-uri")).toEqual(["'none'"]);
      expect(csp!.get("form-action")).toEqual(["'none'"]);
      // Only the players the app embeds (src/lib/embeds.ts) and its own blob: PDFs.
      expect(csp!.get("frame-src")!.sort()).toEqual(["blob:", "https://player.vimeo.com", "https://www.instagram.com", "https://www.tiktok.com", "https://www.youtube-nocookie.com"]);
      for (const list of csp!.values()) expect(list).not.toContain("'unsafe-eval'");
      expect(csp!.get("script-src")).not.toContain("'unsafe-inline'");
    });
  }

  it("serves the functions with a policy that runs nothing", () => {
    const csp = cspFor("/api/fetch");
    expect(csp?.get("default-src")).toEqual(["'none'"]);
    expect(csp?.has("sandbox")).toBe(true);
  });
});
