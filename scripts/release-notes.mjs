// Release notes for GitHub releases, in English.
//
//   node scripts/release-notes.mjs body <version> <ref> <sha>   -> notes for a new release (release.yml)
//   node scripts/release-notes.mjs translate <version> < body    -> an old Russian body rewritten in English
//   node scripts/release-notes.mjs kipple <name>                  -> an old "Saved Board" name with Kipple
//
// "What's new" comes from site/changelog.mjs (the landing page list): the entry for this
// version, or the "next" entry when the version has none yet.
import { readFileSync } from "node:fs";
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

export function translate(text, version) {
  let out = kippleName(text.replace(/\r\n/g, "\n").trim());
  if (out.startsWith("## What's new")) return out; // already rewritten
  for (const [re, to] of RULES) out = out.replace(re, to);
  if (/[А-Яа-яЁё]/.test(out)) throw new Error(`Untranslated text left in ${version}:\n${out}`);
  return withWhatsNew(whatsNew(version), out);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, version, ref, sha] = process.argv.slice(2);
  if (cmd === "body") process.stdout.write(body({ version, ref, sha }) + "\n");
  else if (cmd === "kipple") process.stdout.write(kippleName(version) + "\n");
  else if (cmd === "translate") process.stdout.write(translate(readFileSync(0, "utf8"), version) + "\n");
  else {
    console.error("usage: release-notes.mjs body <version> <ref> <sha> | translate <version> < body");
    process.exit(1);
  }
}
