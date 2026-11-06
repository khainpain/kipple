---
name: i18n-sync
description: "Keep Kipple's RU and EN interface strings in sync (src/i18n/ru.ts and en.ts): add keys, find missing, stale or untranslated strings, keep terminology consistent. Use when adding UI text, changing copy, or reviewing translations."
---

<!-- Adapted for Kipple from Everything Claude Code (https://github.com/affaan-m/everything-claude-code, MIT, v2.2.3). Rewritten for TypeScript dictionaries. -->

# i18n Sync (Kipple)

## How strings work here

- `src/i18n/ru.ts` is the reference dictionary and exports the `Dict` type. `src/i18n/en.ts` is typed `Dict`, so a missing key fails `tsc`.
- Components read `T.section.key` (or call it when the string takes parameters) via `import { T } from "../i18n"`.
- Plurals: Russian uses `plural(n, one, few, many)` with `Intl.PluralRules("ru")`; English uses its own helpers (`s(n)`, `cards(n)`). Never reuse the English plural logic for Russian.

## Workflow

1. **Find hard-coded UI text.** Search `src/**/*.tsx` for Cyrillic or English literals inside JSX, `title=`, `aria-label=`, `placeholder=`, toasts and dialogs. Every user-visible string goes through `T`.
2. **Add the key to both files in the same section and order.** Write Russian natively first, then English natively (not word-for-word).
3. **Check shape.** `npx tsc --noEmit` catches missing keys in `en.ts`. Also look for keys present in `en.ts` but not in `ru.ts` (extra keys are not a type error) and for keys no longer referenced anywhere (`grep -rn "T\.section\.key" src`).
4. **Check for untranslated copies.** An `en.ts` value with Cyrillic, or a `ru.ts` value that is plain English (except brand names), is a bug.
5. **Keep terminology consistent** (use the glossary below; extend it when a new term appears).
6. **Check length.** English is usually shorter, Russian longer; look at buttons, menus and the compact card for overflow.

## Glossary

| RU | EN |
|---|---|
| Избранное (Telegram) | Saved Messages |
| карточка | card |
| тема | topic |
| тег | tag |
| библиотека | library |
| дубликаты | duplicates |
| навести порядок | tidy up |

Brand names stay as is: Kipple, Telegram, Claude, Obsidian.

## Output

List what changed per key: `section.key — RU: … / EN: …`, plus any hard-coded strings found and not yet moved.
