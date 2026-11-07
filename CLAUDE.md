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

## Rules that are easy to break

- **Privacy first.** User content leaves the device only for AI calls after the consent dialog (`aiAllowed()` in `src/lib/store.ts`); no-AI is the default. Sensitive-looking messages are never sent. No third-party services that see user data (no analytics, no favicon services, no runtime CDNs). New hosts in the CSP need a reason.
- **Do not edit prompts casually.** The proxy accepts only the exact system prompts from `src/lib/prompts.ts`; changing one breaks older installed apps that use the built-in key.
- **Keep the identifier `com.khainpain.savedboard`.** Data dir, keyring entries and the updater depend on it, even though the app is now called Kipple.
- **Secrets:** Anthropic key and Telegram session in the OS keyring; Telegram api id/hash from Actions secrets `TG_API_ID`/`TG_API_HASH`. Never commit or log secrets; test fixtures must be synthetic.
- **Both languages.** Any new UI string goes into `ru.ts` and `en.ts`, written natively.
- **UI taste:** quiet and polished; subtle focus states (no loud outlines); `prefers-reduced-motion` makes animations static. Visual design comes from the owner's Claude Design handoffs (`docs/design/`).

## Agents and skills

Project agents live in `.claude/agents/`, skills in `.claude/skills/` (most adapted from Everything Claude Code, see `.claude/THIRD_PARTY_NOTICES.md`). Use them on request or when clearly relevant, not on every change:

- Code review: `react-reviewer`, `rust-reviewer`, `tauri-reviewer`, `security-reviewer`, `silent-failure-hunter`; build failures: `rust-build-resolver`.
- Design and decisions: `architect`, skills `architecture-decision-records` (`docs/adr/`) and `council`.
- Before a PR: skill `verification-loop`; for UI text: `i18n-sync`.
- UI/UX: skills `make-interfaces-feel-better`, `design-system`, `click-path-audit`, `motion-foundations`, `frontend-a11y`, `ui-demo` (demo videos).
- Promotion: `marketing-agent`, `seo-specialist`, skills `product-lens`, `market-research`, `brand-voice`, `article-writing`, `content-engine`, `seo`.
- Public repo hygiene: `opensource-sanitizer` before releases, `opensource-packager` for contributor docs.
