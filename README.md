# Kipple

Desktop app that turns Telegram «Избранное» (Saved Messages) into a visual, searchable library: a masonry grid of cards with AI topics, tags, summaries and actions (read later / idea / reference / todo / junk).

Everything stays on your computer. The only things that leave it are message text sent to the Anthropic API for tagging (sensitive-looking messages are never sent) and requests to the websites your saved links point to (for previews).

## How to use

1. In Telegram Desktop open «Избранное» → ⋮ → «Экспорт истории чата», format **JSON**, tick «Фотографии» (videos and files are optional).
2. Start Kipple and pick the export folder (the one with `result.json`).
3. Optionally add an Anthropic API key in Settings (stored in Windows Credential Manager / macOS Keychain). Tagging ~10k messages with Claude Haiku 5.5 costs about $1–2.
4. Filter, search, mark junk (hover a card → 🗑, or Ctrl/Shift-click to select several), and export to Markdown or CSV.

Re-importing a newer export keeps your edits and AI tags; only new messages are processed.

### Send back to Telegram (desktop only)

The paper-plane button in the toolbar lays the library out inside Telegram: the app creates a private group «Kipple» (a group made by an older version keeps its name «Saved Board» and is reused) with one topic per theme, forwards each original message from «Избранное» into its topic, and replies under it with the title, summary and hashtags (`#прочитать_позже`, `#идея`, the card's tags), so tapping a hashtag in Telegram shows everything with it.

- It logs in to **your own account** over MTProto (the protocol Telegram's apps use, via [grammers](https://github.com/Lonami/grammers)): phone number, code, and the cloud password if you have one. There is no server in between; the session key is kept in the OS credential store and «Выйти» ends the session.
- Telegram needs an app key: open [my.telegram.org](https://my.telegram.org/apps) → «API development tools», create an app (any name, platform Desktop) and paste `api_id` and `api_hash` into the dialog once. If the repository secrets `TG_API_ID` and `TG_API_HASH` are set, builds carry them and nobody has to do this.
- By default junk, sensitive and hidden cards are not sent. Telegram limits sending speed, so the app goes card by card (about 2–3 seconds each) and waits out rate limits; «Стоп» or closing the app is safe, the next run continues where it stopped.
- What was sent is remembered in `telegram.json`, so later runs only send new saves. Delete the group in Telegram and the next run starts a fresh one. Changing a card's theme after sending doesn't move it.

## Where data lives

| What | Where |
| --- | --- |
| Library (imported cards, AI fields, link previews) | `%APPDATA%\com.khainpain.savedboard\library.json` |
| Your edits (append-only log, replayed on load) | `%APPDATA%\com.khainpain.savedboard\edits.jsonl` |
| Anthropic API key, Telegram session and api_id/api_hash | OS credential store |
| What was sent to the Telegram group | `%APPDATA%\com.khainpain.savedboard\telegram.json` |
| Photos and files | Read in place from the Telegram export folder, never copied |

The folder and credential-store entries are named after the app identifier `com.khainpain.savedboard`, from before the app was called Kipple. It stays as is on purpose: changing it would make the app lose the library, the keys and the Telegram session on update.

Settings → «Удалить все данные» removes the library, edits and the key.

## Development

Requirements: Node 22, Rust stable, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev     # run the app
npm run dev:web       # browser build at http://localhost:1420
npm test              # parser, rules and library tests
npm run tauri build   # installer in src-tauri/target/release/bundle
```

### Checking changes without reinstalling

- **Browser build on Vercel.** The same UI runs in a normal browser (`npm run build:web`, `vercel.json`). Every pull request gets its own preview link from Vercel; `main` is the production link. The desktop parts are swapped for browser ones in `src/platform/web.ts`: data in IndexedDB, the export folder picked with the browser's folder dialog, photos shown until the page reloads, no link previews (browsers block cross-site requests), AI tagging works with your own key. «Открыть демо» loads sample cards.
- **Auto-update in the desktop app.** Every push to `main` publishes a signed Windows release `v0.1.<n>` (`.github/workflows/release.yml`). An installed app checks `latest.json` from the latest release on start and offers «Обновить и перезапустить». This needs the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the matching public key is in `src-tauri/tauri.conf.json`, and the release assets must be publicly downloadable.

Windows installers (`.exe`, `.msi`) are also built by GitHub Actions on every pull request; download them from the run's artifacts. They are not code-signed yet, so Windows SmartScreen will warn on first launch («Подробнее» → «Выполнить в любом случае»).

## Layout

- `src/lib/parser.ts`: `result.json` → cards (text entities, links, hashtags, media, albums)
- `src/lib/rules.ts`: junk heuristics and sensitive-content detection
- `src/lib/library.ts`: re-import merge, edit log, filters
- `src/lib/ai.ts`: batched tagging with Claude Haiku 5.5 (structured output)
- `src/lib/telegram.ts`: what goes to which topic, notes and hashtags, paced and resumable sending
- `src/lib/linkmeta.ts`: link previews (OpenGraph, YouTube oEmbed)
- `src/components/`: grid, card, detail and settings UI
- `src/platform/`: desktop (Tauri) and browser implementations of files, dialogs, secrets, HTTP and updates
- `src-tauri/`: Tauri shell, OS credential store commands, updater; `src/telegram.rs` is the Telegram login and send commands
