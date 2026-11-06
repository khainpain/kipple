# Saved Board

Desktop app that turns Telegram «Избранное» (Saved Messages) into a visual, searchable library: a masonry grid of cards with AI topics, tags, summaries and actions (read later / idea / reference / todo / junk).

Everything stays on your computer. The only things that leave it are message text sent to the Anthropic API for tagging (sensitive-looking messages are never sent) and requests to the websites your saved links point to (for previews).

## How to use

1. In Telegram Desktop open «Избранное» → ⋮ → «Экспорт истории чата», format **JSON**, tick «Фотографии» (videos and files are optional).
2. Start Saved Board and pick the export folder (the one with `result.json`).
3. Optionally add an Anthropic API key in Settings (stored in Windows Credential Manager / macOS Keychain). Tagging ~10k messages with Claude Haiku 5.5 costs about $1–2.
4. Filter, search, mark junk (hover a card → 🗑, or Ctrl/Shift-click to select several), and export to Markdown or CSV.

Re-importing a newer export keeps your edits and AI tags; only new messages are processed.

## Where data lives

| What | Where |
| --- | --- |
| Library (imported cards, AI fields, link previews) | `%APPDATA%\com.khainpain.savedboard\library.json` |
| Your edits (append-only log, replayed on load) | `%APPDATA%\com.khainpain.savedboard\edits.jsonl` |
| Anthropic API key | OS credential store |
| Photos and files | Read in place from the Telegram export folder, never copied |

Settings → «Удалить все данные» removes the library, edits and the key.

## Development

Requirements: Node 22, Rust stable, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev     # run the app
npm test              # parser, rules and library tests
npm run tauri build   # installer in src-tauri/target/release/bundle
```

`npm run dev` + http://localhost:1420/preview.html renders the card grid with sample data in a normal browser, without Tauri.

Windows installers (`.exe`, `.msi`) are built by GitHub Actions on every push; download them from the run's artifacts. They are not code-signed yet, so Windows SmartScreen will warn on first launch («Подробнее» → «Выполнить в любом случае»).

## Layout

- `src/lib/parser.ts`: `result.json` → cards (text entities, links, hashtags, media, albums)
- `src/lib/rules.ts`: junk heuristics and sensitive-content detection
- `src/lib/library.ts`: re-import merge, edit log, filters
- `src/lib/ai.ts`: batched tagging with Claude Haiku 5.5 (structured output)
- `src/lib/linkmeta.ts`: link previews (OpenGraph, YouTube oEmbed)
- `src/components/`: grid, card, detail and settings UI
- `src-tauri/`: Tauri shell and OS credential store commands
