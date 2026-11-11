# Kipple: notes for Claude

Kipple ("Tame your kipple") turns Telegram Saved Messages into a searchable masonry board of cards with optional AI topics and tags. Local-first desktop app for Windows; the same UI also builds for the browser on Vercel. Solo developer; the owner writes in Russian.

## Stack and layout

- **UI:** React + TypeScript + Vite in `src/`, rendered in WebView2 by Tauri 2. Platform-specific code behind `src/platform/{tauri,web}.ts` (shared interface in `types.ts`).
- **Rust:** `src-tauri/src` (`lib.rs` commands, `telegram.rs` MTProto sign-in and import via grammers).
- **Data:** JSON in the app data dir (`library.json` + append-only `edits.jsonl`), IndexedDB in the web build. No SQLite, no server-side storage.
- **AI proxy:** `api/claude/` Vercel functions forward to Anthropic with the built-in key, with quotas in `api/_lib/quota.ts`.
- **i18n:** `src/i18n/ru.ts` (reference, exports `Dict`) and `en.ts`. All UI text goes through `T`.
- **Motion:** only `motion` (motion/react), presets in `src/components/Motion.tsx`, tokens in `src/motion.css`. No GSAP.

## Commands

```
npm test              # vitest
npx tsc --noEmit      # types
npm run build         # desktop UI build
npm run build:web     # browser build (Vercel)
npm run tauri dev     # run the app (Windows)
cd src-tauri && cargo check
```

CI (`.github/workflows/build.yml`) runs tests and both builds on every PR. Desktop releases are **manual**: Actions → release → Run workflow. Vercel deploys the web build automatically.

### Releasing a version

1. Merge what goes in; main's CI is green.
2. In `scripts/changelog.mjs`, turn the `"next"` entry into the new version (`ver: "0.1.N"`, `date: "YYYY-MM-DD"`), one user-facing line per change in `en` and `ru`. Merge that before the release: its `en` lines become the GitHub release notes and the landing's "What's new".
3. Actions → release → Run workflow with `version` = `0.1.N` (empty means `0.1.<run number>`).
4. The site updates itself. The landing page lives in the private repo `khainpain/kipple-site` (its own Vercel project); it reads `scripts/changelog.mjs` from `main` and highlights the newest released entry. Every version number on the landing (the pill, `v{ver}` under the download button, structured data) comes from one source: the latest GitHub release, read when the site is built. Nothing to edit by hand. The release workflow rebuilds the site at the end through the `VERCEL_DEPLOY_HOOK` secret. Without it, redeploy the site project on Vercel once the release is out, or the site keeps showing the previous version.
5. Check the landing: the pill shows the new version and the new entry is highlighted.

## Rules that are easy to break

- **Privacy first.** User content leaves the device only for AI calls after the consent dialog (`aiAllowed()` in `src/lib/store.ts`); no-AI is the default. Sensitive-looking messages are never sent. No third-party services that see user data (no analytics, no favicon services, no runtime CDNs). New hosts in the CSP need a reason.
- **Do not edit prompts casually.** The proxy accepts only the exact system prompts from `src/lib/prompts.ts`; changing one breaks older installed apps that use the built-in key.
- **Keep the identifier `io.getkipple.app`.** Data dir, keyring entries and web view storage depend on it. It replaced `com.khainpain.savedboard` after v0.1.17; `src-tauri/src/migrate.rs` copies the old data over on first launch, so never remove that migration or change the identifier again without a new one.
- **Secrets:** Anthropic key and Telegram session in the OS keyring; Telegram api id/hash from Actions secrets `TG_API_ID`/`TG_API_HASH`. Never commit or log secrets; test fixtures must be synthetic.
- **Both languages.** Any new UI string goes into `ru.ts` and `en.ts`, written natively.
- **Reuse first.** Before writing code, use what Kipple, the platform or an installed dependency already has; write only what the task needs, never cutting privacy, validation, data-loss handling or accessibility. Details: skill `reuse-first`.
- **UI taste:** quiet and polished; subtle focus states (no loud outlines); `prefers-reduced-motion` makes animations static. Visual design comes from the owner's Claude Design handoffs (kept in `khainpain/kipple-site`, `design/`).

## Agents and skills

Project agents live in `.claude/agents/`, skills in `.claude/skills/` (most adapted from Everything Claude Code, see `.claude/THIRD_PARTY_NOTICES.md`). Use them on request or when clearly relevant, not on every change:

- Code review: `react-reviewer`, `rust-reviewer`, `tauri-reviewer`, `security-reviewer`, `silent-failure-hunter`; build failures: `rust-build-resolver`.
- Design and decisions: `architect`, skills `architecture-decision-records` (`docs/adr/`) and `council`.
- Writing any feature or fix: skill `reuse-first` (from Ponytail).
- Before a PR: skill `verification-loop`; for UI text: `i18n-sync`.
- From Superpowers (obra/superpowers): `systematic-debugging` for any bug or failing test (root cause before a fix), `test-driven-development` (failing test first), `verification-before-completion` (run the checks before saying "done"), `requesting-code-review` before merge, `receiving-code-review` when acting on review comments, `dispatching-parallel-agents` for independent checks.
- UI/UX: skills `make-interfaces-feel-better`, `design-system`, `click-path-audit`, `motion-foundations`, `frontend-a11y`, `ui-demo` (demo videos).
- Public repo hygiene: `opensource-sanitizer` before releases, `opensource-packager` for contributor docs.
