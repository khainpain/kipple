// Retakes the hero screenshots of the browser demo (light/dark, EN/RU) as PNGs in the current folder.
// Run: npm run build:web, then npx vite preview --mode web --port 4173, then node site/screenshots.cjs.
// Convert to site/public/img/board-<theme>-<lang>-{960,1600}.webp (Pillow, quality 80), then node site/og.cjs.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const theme of ['light','dark']) for (const lang of ['en','ru']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 2, colorScheme: theme, locale: lang });
    const p = await ctx.newPage();
    await p.goto(`http://localhost:4173/app/?demo&lang=${lang}`);
    await p.waitForTimeout(1500);
    await p.addStyleTag({ content: '.banner{display:none!important}' });
    await p.getByText(lang==='en'?'All cards':'Все карточки', {exact:true}).first().click();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `board-${theme}-${lang}.png` });
    await ctx.close();
  }
  await b.close();
})();
