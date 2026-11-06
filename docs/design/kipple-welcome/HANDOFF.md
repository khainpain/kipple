# Implement the new Kipple welcome screen + QR sign-in

Repository: khainpain/telegram-saved-messages (Tauri + React app "Kipple", formerly "Saved Board"). Build on top of PR #15 (built-in Telegram API key, 3-step phone sign-in, «Для продвинутых» in Settings, 7-step export help) — merge it first or branch from it.

The approved mockup is the «Приветствие» artboard on this Claude Design canvas: https://claude.ai/artifact/1EapYpY4PqgbcqS6PKWtGE (open it in Play to try the interactions). Everything you need is also written out below, so the canvas is a reference, not a dependency.

Use the existing tokens in `src/App.css` (`--bg --side --panel --ink --muted --line --hover --accent --accent-ink --accent-soft --ok --radius --shadow --shadow-hover`) so light and dark themes both work; no new hard-coded colours except where noted. No orange focus rings (PR #15 removed them). All copy goes through `src/i18n/ru.ts` and `en.ts` (write the EN versions yourself).

## 1. Layout (replaces the `.welcome` block in `src/App.tsx`)

- **Header**, full width, padding 20px 32px: Kipple logo lockup left (`brand/kipple-logo-light.svg`, dark theme `kipple-logo-dark.svg`, height 36px). Right: language pill (RU/EN), **settings gear** icon-button (opens the existing Settings dialog — this replaces the old «Настройки и ключ AI» button), theme toggle icon-button.
- **Body**: centred container max-width 1080px, two columns that wrap on narrow windows (left `flex: 1 1 440px`, right `flex: 1 1 380px`, gap 48px).
- Left column is a **two-screen slider**: a viewport `overflow: hidden` (give it 12px padding/negative margin so card shadows aren't clipped) holding a 200%-wide track; screen 1 = sign-in, screen 2 = export instructions. Switching = `transform: translateX(0 | -50%)` with `transition: transform .45s cubic-bezier(.2,.8,.2,1)` and the off-screen pane fading to opacity 0 (.3s). Make the hidden pane `inert` / `aria-hidden` so Tab doesn't reach it.
- Right column: the animated collage (section 4).
- Must fit a 1440×900 window without scrolling.

## 2. Screen 1 — sign-in

Top to bottom (gap 18px):
1. H1 34px/700, letter-spacing -0.02em: «Разберём твоё «Избранное»».
2. Lead 16px/1.5, `--muted`, max-width 460px: «Kipple превращает «Избранное» Telegram в визуальную библиотеку с темами, тегами и поиском.»
3. **Security chip** (the one emphasised trust signal): pill, padding 5px 10px 5px 5px, background `rgba(27,122,67,.1)` (dark: a tint of `--ok`), text `--ok` 12px/600, leading 18px circle filled `--ok` with a white lock icon: «Только на твоём компьютере».
4. **Sign-in card**: `--panel`, radius 18px, `--shadow-hover`, padding 22px 24px, max-width 520px, flex column gap 16px.
   - Header row: 36px rounded-10 square `--accent-soft` with a paper-plane icon in `--accent-ink`, then H2 18px/650 — «Войти в Telegram по QR-коду» in QR mode, «Войти в Telegram по номеру» in phone mode. Only this one heading.
   - **QR mode (default)**: row (wraps) of a 164×164 white tile (radius 14, 1px `--line`, padding 8) holding the live QR with `brand/kipple-mascot-light.svg` 40px in the centre (use high error-correction, level H, so the logo doesn't break scanning), and a numbered list (22px circles `--accent-soft`/`--accent-ink`, 13px text):
     1. «Открой Telegram на телефоне»
     2. «Зайди в **Настройки → Устройства → Подключить устройство**»
     3. «Наведи камеру на этот код, чтобы подтвердить вход»
     Below, centred link-button 13.5px/600 `--accent-ink`: «Войти по номеру телефона».
   - **Phone mode**: the PR #15 flow inline in this card — stepper «1. Номер · 2. Код из Telegram · 3. Облачный пароль · если есть» (4px bars, active = `--accent`), label «Номер телефона аккаунта Telegram», 44px input (placeholder «+7 999 123-45-67») + «Получить код» primary button on one row; then code and password steps as in `TelegramDialog.tsx`. Centred link «Войти по QR-коду» switches back.
   - If QR login returns SESSION_PASSWORD_NEEDED, go to the same cloud-password step.
   - **No built-in key** (PR #15 `noApi` state): replace the QR/phone body with a quiet `--side` panel: lock icon + «В этой сборке нет встроенного ключа Telegram. Добавь свой в «Настройки» → «Для продвинутых», и вход заработает.» + secondary «Открыть настройки». Not styled as an error.
   - Card footer: full-bleed row with 1px `--line` top border, centred, 12.5px `--muted`, lock icon: «Пароль и коды вводятся только в Telegram, мы их не видим».
   - Web build (`platform.telegram` undefined): hide the sign-in card and the «или без входа» divider; the import/demo row becomes the main action.
5. Divider: hairlines either side of «или без входа» (12.5px `--muted`).
6. Row (max-width 520px, gap 8px, wraps): two tiles, same style — `--panel`, 1px `--line`, radius `--radius`, padding 14px 16px, 36px icon square `--side`/`--muted`, title 600 + 12.5px `--muted` hint:
   - **«Импорт из файла экспорта»** / «Из Telegram Desktop · пара минут», folder icon, chevron right, `flex: 1 1 300px` → slides to screen 2.
   - **«Демо»** / «Без входа», sparkle icon, `flex: 0 1 172px` → existing demo action (keep it web-only if that's still the rule, otherwise show on desktop too).
   No AI-key hint on this screen any more.

## 3. Screen 2 — export instructions

«‹ Назад ко входу» link (`--muted`) → slides back. H1 30px «Экспорт из Telegram», lead «Пара минут в Telegram Desktop, и вся библиотека здесь.» Then a `--side` box radius 18 padding 20 with the 7 steps from PR #15 (`T.welcome.steps`), each with a 26px white numbered circle with `--shadow`, 14px/1.45 text. Then primary «Выбрать папку экспорта» (folder icon, 44px) + secondary «Открыть демо». This replaces the PR #15 `<details className="export-help">` on the welcome screen.

## 4. Right column — animated collage (decorative, `aria-hidden` except the mascot button)

420×590 box, padding-top 72px:
- Soft panel: `--side`, radius 32, top 40 left 40 right 20 height 400.
- Four tilted `.card`s using the existing card styles (title 14/600, pill, `#tag` in `--accent-ink`):
  - left 0 top 70, w 170, rotate −5°: cover = `container-queries.svg` (72px tall), «Container queries на практике», pill «Прочитать позже».
  - right 0 top 30, w 160, rotate 4°: no cover, «Бот, который присылает три случайные сохранёнки», pill «Идея».
  - left 242 top 344, w 178, rotate −3°: cover = `shakshuka.svg` (84px), «Шакшука с фетой», `#рецепты`.
  - left 0 top 384, w 214, rotate 3°: **video card** «Kipple за 30 секунд», pill «Посмотреть позже», `#видео`, meta «youtube.com». Cover 118px, background `#23211E`: a 64px talking mascot (hops, blinks, mouth animates), a cream speech bubble cycling three lines every 3s — «Пересылаешь в «Избранное» всё подряд?» → «Я разложу это по темам и тегам.» → «А ты найдёшь нужное за секунду.»; bottom: coral play circle, progress bar filling over 9s in sync, `.badge-corner` «0:30».
- Each card floats with **its own** motion and period so they never sync: kp-float 5.3s, kp-f-sway 6.7s, kp-f-drift 8.6s, kp-f-loop 9.7s (negative delays so they start mid-cycle). Pass each card's tilt as `--r`.
- **Mascot** 230×230 centred at (50%, 239px), bobbing (kp-bob 4.8s). It is a `<button aria-label="Kipple">` (transparent, round). Render the body from a copy of `brand/kipple-mascot-light.svg` with the two eye paths and the mouth path removed (`M32.5 46 Q38 38.5 43.5 46`, `M56.5 46 Q62 38.5 67.5 46`, `M46 53 Q50 56.5 54 53`), and draw the face as an inline SVG overlay with the same viewBox and the same `<g transform="translate(50 56) scale(1.04 0.97) translate(-50 -56)">`, so the face can animate:
  - Blink: the eye arcs `scaleY` down to .12 twice in a row every 5.2s (`transform-box: fill-box; transform-origin: 50% 100%`).
  - Easter eggs (count consecutive clicks; a gap > 1.5s resets the count): **7th click → salto** (full 360°, 1.1s); keep counting, **13th click → angry** for 2.6s: brows `M31 37.5 L43.5 42.5` / `M69 37.5 L56.5 42.5`, dot eyes r 2.8 at (38.5,47.5)/(61.5,47.5), frown `M45 56.5 Q50 52 55 56.5`, three steam strokes `M74 20 l4 -4 M80 24 l5 -2 M77 29 l5 1`, body shakes and darkens (`filter: saturate(1.35) brightness(.88)`), then reset to 0. Ignore clicks while angry. Pressing scales the mascot to .94.
  - Important: every salto keyframe must list the same transform functions in the same order (translateY rotate scale), otherwise the browser interpolates via matrix and the spin is cut short.
- `prefers-reduced-motion: reduce` turns off all of the above (show the first speech line statically).

Keyframes from the mockup (copy as-is into App.css or a `Welcome.css`):
```css
@keyframes kp-float{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-9px) rotate(calc(var(--r,0deg) + 1.2deg))}}
@keyframes kp-bob{0%,100%{transform:translate(-50%,-50%) rotate(-2deg) scale(1)}50%{transform:translate(-50%,-53%) rotate(2deg) scale(1.02)}}
.kp-float{animation:kp-float 6s ease-in-out infinite}
@keyframes kp-f-drift{0%,100%{transform:translate(0,0) rotate(var(--r,0deg))}33%{transform:translate(5px,-6px) rotate(calc(var(--r,0deg) + .8deg))}66%{transform:translate(-3px,-10px) rotate(calc(var(--r,0deg) - .6deg))}}
@keyframes kp-f-sway{0%,100%{transform:translate(0,0) rotate(var(--r,0deg))}25%{transform:translate(-2px,-3px) rotate(calc(var(--r,0deg) - 2deg))}75%{transform:translate(2px,-5px) rotate(calc(var(--r,0deg) + 2deg))}}
@keyframes kp-f-loop{0%,100%{transform:translate(0,0) rotate(var(--r,0deg))}25%{transform:translate(6px,-4px) rotate(var(--r,0deg))}50%{transform:translate(0,-9px) rotate(calc(var(--r,0deg) + 1deg))}75%{transform:translate(-6px,-4px) rotate(var(--r,0deg))}}
.kp-bob{animation:kp-bob 4.8s ease-in-out infinite}
@keyframes kp-blink{0%,86%,100%{transform:scaleY(1)}89%{transform:scaleY(.12)}92%{transform:scaleY(1)}95%{transform:scaleY(.12)}98%{transform:scaleY(1)}}
@keyframes kp-salto{0%{transform:translateY(0) rotate(0deg) scale(1,1)}12%{transform:translateY(8px) rotate(0deg) scale(1.1,.88)}30%{transform:translateY(-70px) rotate(-90deg) scale(.96,1.04)}50%{transform:translateY(-95px) rotate(-180deg) scale(1,1)}70%{transform:translateY(-60px) rotate(-270deg) scale(1,1)}84%{transform:translateY(0) rotate(-360deg) scale(1,1)}91%{transform:translateY(4px) rotate(-360deg) scale(1.1,.9)}100%{transform:translateY(0) rotate(-360deg) scale(1,1)}}
.kp-flip{animation:kp-salto 1.1s linear both}
@keyframes kp-shake{0%,100%{transform:translate(0) rotate(0)}20%{transform:translate(-7px,1px) rotate(-4deg)}40%{transform:translate(6px,-1px) rotate(3deg)}60%{transform:translate(-5px,0) rotate(-3deg)}80%{transform:translate(4px,1px) rotate(2deg)}}
.kp-angry{animation:kp-shake .45s ease-in-out 5}
.kp-angry img{filter:saturate(1.35) brightness(.88);transition:filter .2s}
.kp-tap:active>div{transform:scale(.94);transition:transform .08s}
.kp-eye{transform-box:fill-box;transform-origin:50% 100%;animation:kp-blink 5.2s ease-in-out infinite}
@keyframes kp-talk{0%,100%{transform:scaleY(.3)}25%{transform:scaleY(1)}50%{transform:scaleY(.45)}75%{transform:scaleY(.85)}}
.kp-mouth{transform-box:fill-box;transform-origin:50% 50%;animation:kp-talk .42s ease-in-out infinite}
@keyframes kp-hop{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4px) rotate(3deg)}}
.kp-hop{animation:kp-hop 1.3s ease-in-out infinite}
@keyframes kp-cap{0%{opacity:0;transform:translateY(5px)}4%,29%{opacity:1;transform:none}33%,100%{opacity:0;transform:translateY(-5px)}}
.kp-cap{position:absolute;inset:0;display:flex;align-items:center;opacity:0;animation:kp-cap 9s ease-in-out infinite}
@keyframes kp-prog{from{width:0}to{width:100%}}
.kp-prog{animation:kp-prog 9s linear infinite}
@media (prefers-reduced-motion: reduce){.kp-float,.kp-bob,.kp-eye,.kp-mouth,.kp-hop,.kp-prog{animation:none}.kp-cap{animation:none}.kp-cap:first-child{opacity:1}}
```

Assets to add (put in `public/` or import them; also add dark variants if you can):

`shakshuka.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 84" width="360" height="168"><rect width="180" height="84" fill="#E3F2D9"/><circle cx="16" cy="14" r="3" fill="#C9E3B8"/><circle cx="160" cy="70" r="4" fill="#C9E3B8"/><circle cx="152" cy="12" r="2.4" fill="#C9E3B8"/><rect x="126" y="38" width="44" height="10" rx="5" fill="#23211E" transform="rotate(-14 126 43)"/><circle cx="90" cy="45" r="36" fill="#23211E"/><path d="M90 14.5 L94.6 15.6 L98.3 14.6 L102.5 16.8 L106.8 17.4 L109.6 20.8 L113.8 22.9 L115.4 27.1 L118.8 30.4 L118.9 35 L120.6 39.4 L119.1 43.6 L119.8 48.3 L117.1 52 L116.5 56.7 L113 59.6 L111 63.9 L106.6 65.3 L103.2 68.6 L98.6 68.6 L94.4 70.5 L90 69.2 L85.6 70.5 L81.4 68.6 L76.8 68.6 L73.4 65.3 L69 63.9 L67 59.6 L63.5 56.7 L62.9 52 L60.2 48.3 L60.9 43.6 L59.4 39.4 L61.1 35 L61.2 30.4 L64.6 27.1 L66.2 22.9 L70.4 20.8 L73.2 17.4 L77.5 16.8 L81.7 14.6 L85.4 15.6Z" fill="#D9573B"/><circle cx="73" cy="33" r="3" fill="#E9714F"/><circle cx="104" cy="58" r="3.4" fill="#E9714F"/><circle cx="112" cy="35" r="2.4" fill="#E9714F"/><path d="M68 47 c4 -9 15 -10 19 -2 c3 7 -4 13 -11 12 c-6 -1 -10 -5 -8 -10z" fill="#FFFDF9"/><circle cx="77.5" cy="49" r="4.6" fill="#F2B33D"/><path d="M93 26 c6 -6 17 -3 18 5 c1 8 -8 12 -14 10 c-5 -2 -8 -10 -4 -15z" fill="#FFFDF9"/><circle cx="101.5" cy="32" r="4.4" fill="#F2B33D"/><path d="M92 52 c5 -7 16 -5 17 3 c1 7 -7 11 -13 9 c-5 -2 -7 -8 -4 -12z" fill="#FFFDF9"/><circle cx="100" cy="57" r="4.2" fill="#F2B33D"/><rect x="82" y="34" width="6" height="6" rx="1.6" fill="#F6F1EA" transform="rotate(14 85 37)"/><rect x="66" y="58" width="5.5" height="5.5" rx="1.5" fill="#F6F1EA" transform="rotate(-18 69 61)"/><rect x="110" y="45" width="5" height="5" rx="1.4" fill="#F6F1EA" transform="rotate(22 112 47)"/><rect x="87" y="62" width="4.6" height="4.6" rx="1.3" fill="#F6F1EA" transform="rotate(8 89 64)"/><ellipse cx="75" cy="25" rx="5.5" ry="2.6" fill="#3F7A35" transform="rotate(-30 75 25)"/><ellipse cx="88" cy="47" rx="4.6" ry="2.2" fill="#3F7A35" transform="rotate(40 88 47)"/><ellipse cx="113" cy="56" rx="5" ry="2.3" fill="#3F7A35" transform="rotate(-50 113 56)"/><ellipse cx="66" cy="40" rx="4" ry="2" fill="#5E9A4A" transform="rotate(70 66 40)"/><ellipse cx="96" cy="19" rx="4.2" ry="2" fill="#5E9A4A" transform="rotate(10 96 19)"/><path d="M84 10 q-3 -4 0 -7 M94 9 q-3 -4 0 -7" fill="none" stroke="#23211E" stroke-width="2" stroke-linecap="round" opacity=".35"/></svg>
```

`container-queries.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 72" width="340" height="144"><rect width="170" height="72" fill="#DCE8F3"/><circle cx="12" cy="62" r="3" fill="#C3D7EA"/><circle cx="160" cy="10" r="2.6" fill="#C3D7EA"/><rect x="18" y="12" width="78" height="50" rx="6" fill="#FFFDF9"/><rect x="18" y="12" width="78" height="9" rx="4.5" fill="#23211E"/><circle cx="24" cy="16.5" r="1.6" fill="#D9573B"/><circle cx="29" cy="16.5" r="1.6" fill="#F2A58F"/><circle cx="34" cy="16.5" r="1.6" fill="#E9DFD3"/><rect x="24" y="26" width="31" height="15" rx="3" fill="#D9573B"/><rect x="59" y="26" width="31" height="15" rx="3" fill="#2F6FAE" opacity=".85"/><rect x="24" y="45" width="31" height="11" rx="3" fill="#E9DFD3"/><rect x="59" y="45" width="31" height="11" rx="3" fill="#E9DFD3"/><rect x="108" y="12" width="44" height="50" rx="6" fill="#FFFDF9"/><rect x="108" y="12" width="44" height="9" rx="4.5" fill="#23211E"/><circle cx="114" cy="16.5" r="1.6" fill="#D9573B"/><rect x="113" y="26" width="34" height="12" rx="3" fill="#D9573B"/><rect x="113" y="41" width="34" height="8" rx="3" fill="#2F6FAE" opacity=".85"/><rect x="113" y="52" width="34" height="5" rx="2.5" fill="#E9DFD3"/><path d="M99 37 h6 M102 34 l3 3 -3 3" fill="none" stroke="#23211E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 66 h78 M108 66 h44" fill="none" stroke="#2F6FAE" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 3" opacity=".7"/></svg>
```

## 5. QR sign-in backend (desktop)

`src-tauri/src/telegram.rs` (grammers 0.11) only has phone sign-in. Add QR login with the MTProto login-token flow:
- `auth.exportLoginToken { api_id, api_hash, except_ids: [] }` → `auth.loginToken { expires, token }`; QR content = `tg://login?token=` + base64url(token) without padding.
- Re-export when `expires` passes (about every 30s) and on `updateLoginToken`; poll if updates aren't delivered.
- `auth.loginTokenMigrateTo { dc_id, token }` → switch to that DC and call `auth.importLoginToken`.
- `auth.loginTokenSuccess` → signed in; error `SESSION_PASSWORD_NEEDED` → existing cloud-password step (`tg_check_password`).
- grammers may have no high-level helper for this; use its raw `invoke` with the `tl` types. Check what 0.11 actually exposes before writing it.
- Expose Tauri commands like `tg_qr_start` (returns the URL and expiry, refreshes), `tg_qr_poll` / an event, and `tg_qr_cancel`. Add them to `TelegramApi` in `src/platform/types.ts` and `tauri.ts`.
- Front end: render the QR with a small library (e.g. `qrcode`, error correction H) into the 164px tile; regenerate on refresh, never show an expired code. Cancel polling when switching to phone mode or leaving the screen.
- Remember PR #15's note: CI on PRs doesn't build Rust. Run `cargo check` / `npm run tauri build` locally, or say clearly what is unverified.

## 6. Done when

- Welcome in light and dark at 1440×900 matches the canvas with no scroll; it wraps cleanly in a ~900px-wide window.
- QR mode by default; switching to phone and back works; phone flow and password step still work; noApi state shows the quiet panel; the web build hides sign-in.
- Slide to the export screen and back works with keyboard (hidden pane not focusable).
- Easter eggs: 7 quick clicks → one full salto; 13 → angry for ~2.6s, then calm.
- RU and EN strings complete; `npm test` passes; tests for the click-counter logic and for the login-token URL encoding.
- Rename what's still «Saved Board» on this screen to Kipple (sidebar/brand rename can be a separate change; mention it if you skip it).
