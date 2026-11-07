// Release notes for GitHub releases, in English.
//
//   node scripts/release-notes.mjs body <version> <ref> <sha>   -> notes for a new release (release.yml)
//   node scripts/release-notes.mjs translate <version> [sha] < body    -> an old Russian body rewritten in English
//   node scripts/release-notes.mjs kipple <name>                  -> an old "Saved Board" name with Kipple
//
// "What's new" comes from site/changelog.mjs (the landing page list): the entry for this
// version, or the "next" entry when the version has none yet.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changelog } from "../site/changelog.mjs";

export function whatsNew(version) {
  const v = String(version).replace(/^v/, "");
  const entry = changelog.find((c) => c.ver === v);
  return entry ? entry.en : [];
}

function withWhatsNew(items, rest) {
  if (!items.length) return rest;
  return ["## What's new", "", ...items.map((i) => `- ${i}`), "", rest].join("\n");
}

export function body({ version, ref, sha }) {
  const v = String(version).replace(/^v/, "");
  const items = whatsNew(v).length ? whatsNew(v) : (changelog.find((c) => c.ver === "next")?.en ?? []);
  const install = [
    `Built from ${ref} @ ${sha}.`,
    `Already installed? The app will offer the update on its own. For a first install, download \`Install-Kipple-${v}.exe\` below (if it doesn't start, use the classic \`Kipple_${v}_x64-setup.exe\`).`,
  ].join("\n");
  return withWhatsNew(items, install);
}

// The old bodies all follow the same two-line template, so a fixed set of replacements covers them.
const RULES = [
  [/^Сборка из (\S+) @ ([0-9a-f]+)\./m, "Built from $1 @ $2."],
  [/^Автоматическая сборка из ([0-9a-f]+)\./m, "Built from main @ $1."],
  [/Уже установленное приложение предложит обновиться само\./, "Already installed? The app will offer the update on its own."],
  [/Для первой установки скачай (`[^`]+`) ниже/, "For a first install, download $1 below"],
  [/ \(если он не запускается, есть классический (`[^`]+`)\)/, " (if it doesn't start, use the classic $1)"],
];

// The app was called Saved Board before v0.1.12; releases and their files use Kipple now.
export const kippleName = (s) => s.replace(/Saved[. ]Board/g, "Kipple");

export function translate(text, version, sha) {
  let out = kippleName(text.replace(/\r\n/g, "\n").trim());
  // A body without the install lines (v0.1.16 went out like that): rebuild it in full.
  if (sha && !out.includes("Built from")) return body({ version, ref: "main", sha });
  if (out.startsWith("## What's new")) return out; // already rewritten
  for (const [re, to] of RULES) out = out.replace(re, to);
  if (/[А-Яа-яЁё]/.test(out)) throw new Error(`Untranslated text left in ${version}:\n${out}`);
  return withWhatsNew(whatsNew(version), out);
}

// Compare paths, not URLs: on the Windows release runner argv[1] is "D:\\a\\...", not a file:// URL.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [cmd, version, ref, sha] = process.argv.slice(2);
  if (cmd === "body") process.stdout.write(body({ version, ref, sha }) + "\n");
  else if (cmd === "kipple") process.stdout.write(kippleName(version) + "\n");
  else if (cmd === "translate") process.stdout.write(translate(readFileSync(0, "utf8"), version, ref) + "\n");
  else {
    console.error("usage: release-notes.mjs body <version> <ref> <sha> | translate <version> [sha] < body | kipple <name>");
    process.exit(1);
  }
}
