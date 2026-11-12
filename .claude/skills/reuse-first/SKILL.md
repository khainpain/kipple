---
name: reuse-first
description: "Smallest complete change for Kipple: reuse what the repo, the platform or an installed dependency already has before writing new code. Use when planning or writing any feature or fix."
---

<!-- Adapted for Kipple from Ponytail (https://github.com/DietrichGebert/ponytail, skills/ponytail/SKILL.md, MIT). Rules only; no plugin, hooks or commands. -->

# Reuse first

The best code is the code never written. Solve the whole task with the least new code, and end the reply with one or two lines: what was skipped or not checked, and any risk.

## Before you write

Read the task and the code it touches. List every place the change must reach: callers, tests, fixtures, i18n (`ru.ts` and `en.ts`), both platforms (`src/platform/tauri.ts` and `web.ts`), Rust commands. Check what it could break for users: data it would lose or expose, older installed apps (prompts in `src/lib/prompts.ts`, the `io.getkipple.app` identifier). That is scope. Extra features are not.

Say your assumptions before you code. If the task can be read two ways, show both and start on the likelier one; don't pick silently.

## The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip options and flexibility nobody asked for, and name them in one line.
2. Already in Kipple? A helper in `src/lib/`, a component, a motion preset in `src/components/Motion.tsx`, a token in the CSS. Use it the way the surrounding code does.
3. The browser, WebView2, React or Rust std does it? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency (`package.json`, `Cargo.toml`)? Use it. Never add a dependency for a few lines, and never one that sends user data anywhere.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Lazy about the solution, never about the change: finish every part the task needs, including callers, tests and fixtures it breaks.
- No abstraction, wrapper, option, config or "for later" code nobody asked for. Deletion beats addition. Keep the existing layers and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Surgical: touch only lines the task needs. Don't restyle, refactor or reword nearby code. Remove what your change made dead; name other dead code you notice, don't delete it.
- Comment only the why the code cannot show, in one line.
- Bug fix: grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- New non-trivial logic (a branch, a loop, a parser, money, security) leaves one small vitest or Rust test.

Never cut: the privacy rules in `CLAUDE.md` (consent before AI, no third-party services), validation at trust boundaries (Telegram data, the AI proxy), error handling that prevents data loss (`library.json`, `edits.jsonl`, the Telegram backup), security, accessibility, `prefers-reduced-motion`, both languages, anything the user asked for.
