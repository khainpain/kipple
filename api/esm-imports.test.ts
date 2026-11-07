// Vercel runs each api/ file as a native ES module (package.json "type": "module"), and Node then
// needs the full file name in relative imports. Without ".js" a function fails to start
// (ERR_MODULE_NOT_FOUND) while tests and builds stay green, so check every file the functions reach.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

describe("api functions", () => {
  it("use relative imports that Node can resolve", () => {
    const todo = walk("api").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const seen = new Set<string>();
    const bad: string[] = [];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const m of readFileSync(f, "utf8").matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.[^"']*)["']/gm)) {
        const spec = m[1];
        if (spec.endsWith(".json")) continue;
        if (!spec.endsWith(".js")) bad.push(`${f}: ${spec}`);
        else todo.push(normalize(join(dirname(f), spec.replace(/\.js$/, ".ts"))));
      }
    }
    expect(bad).toEqual([]);
  });
});
