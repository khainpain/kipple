---
name: verification-loop
description: "Verify Kipple changes before a PR: type check, tests, web build, Rust check, privacy grep and diff review, then a PASS/FAIL report. Use after finishing a feature or fix, before opening a PR."
---

<!-- Adapted for Kipple from Everything Claude Code (https://github.com/affaan-m/everything-claude-code, MIT, v2.2.3). Trimmed to this repo's commands. -->

# Verification Loop (Kipple)

Run the phases in order and stop at the first FAIL to fix it. These mirror `.github/workflows/build.yml`.

1. **Types:** `npx tsc --noEmit`
2. **Tests:** `npm test` (vitest; tests live next to code as `*.test.ts` in `src/lib` and `api/`)
3. **Builds:** `npm run build` and `npm run build:web`
4. **Rust** (if `src-tauri/` changed): `cd src-tauri && cargo check` and, when available, `cargo clippy -- -D warnings`. The full Tauri bundle builds only on Windows in Actions; do not try to produce installers locally.
5. **Privacy and secrets grep** on the diff (`git diff origin/main...`):
   - no new network hosts in code or in the CSP without a reason;
   - no API keys, tokens, `TG_API_HASH` values, personal data or real exported messages (fixtures must be synthetic);
   - no `console.log` of user content or secrets;
   - AI calls still gated by consent (`aiAllowed()`).
6. **i18n:** any new UI text exists in both `src/i18n/ru.ts` and `en.ts` (see the `i18n-sync` skill).
7. **Diff review:** read the full diff once; if `src/lib/prompts.ts` changed, flag it loudly (it breaks older app versions on the built-in key).

## Report

```
VERIFICATION: PASS | FAIL
Types   ✓/✗   Tests ✓/✗ (n passed)   Build ✓/✗   Web ✓/✗   Rust ✓/✗/skipped
Privacy ✓/✗   i18n ✓/✗   prompts.ts changed: yes/no
Notes: …
```
