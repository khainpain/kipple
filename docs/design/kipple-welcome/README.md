# Kipple — экспорт из Claude Design

Канвас (интерактивный, Play): https://claude.ai/artifact/1EapYpY4PqgbcqS6PKWtGE
Ссылка приватная — откроется только тем, с кем поделились через Share.

## screens/ (1440×900 @2x, светлая тема)
- 01-welcome-qr.png — стартовый экран, вход по QR (режим по умолчанию)
- 02-welcome-phone.png — тот же экран после «Войти по номеру телефона»
- 03-welcome-export-steps.png — второй экран (листается по «Импорт из файла экспорта»)
- 04-signin-no-builtin-key.png — карточка входа в сборке без встроенного ключа
- 05-settings.png — настройки (раздел «Для продвинутых» свёрнут)
- 06-settings-advanced-own-key.png — «Для продвинутых» раскрыт, задан свой ключ

## assets/
- shakshuka.svg, container-queries.svg — обложки карточек в коллаже
- kipple-mascot-noface-light.svg — маскот без лица (лицо рисуется поверх и анимируется)

## HANDOFF.md
Полное ТЗ: размеры, тексты, анимации (keyframes), пасхалки, бэкенд QR-входа, критерии готовности.
Анимации на скриншотах не видны — смотри канвас или HANDOFF.md.

## MOTION.md
Единый набор анимаций на React Bits (через shadcn MCP): какие компоненты, с какими настройками и где. Он важнее keyframes в HANDOFF.md: в коде используй компоненты React Bits, а не самописный CSS.
