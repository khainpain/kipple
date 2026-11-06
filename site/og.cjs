// Renders the 1200x630 Open Graph images from the landing's own assets.
// Run by hand after the screenshots change: node site/og.cjs (needs Playwright's Chromium).
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');
const root = path.join(__dirname, 'public/img/');
const logo = fs.readFileSync(root + 'kipple-logo-light.svg', 'base64');
const copy = { en: ['Your Telegram Saved Messages as a board you can search', 'Free Windows app. Local, open source.'],
               ru: ['«Избранное» Telegram в виде доски с поиском', 'Бесплатно для Windows. Локально, открытый код.'] };
(async () => {
  const b = await chromium.launch();
  for (const lang of ['en','ru']) {
    const shot = fs.readFileSync(root + `board-light-${lang}-960.webp`, 'base64');
    const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:#f5f3ef;font-family:'Segoe UI',system-ui,sans-serif;color:#23211e;overflow:hidden;position:relative">
      <img src="data:image/svg+xml;base64,${logo}" style="position:absolute;left:64px;top:56px;height:52px">
      <div style="position:absolute;left:64px;top:150px;width:520px;font-size:50px;font-weight:700;line-height:1.1;letter-spacing:-0.02em">${copy[lang][0]}</div>
      <div style="position:absolute;left:64px;bottom:64px;width:520px;font-size:22px;line-height:1.35;color:#6b665e">${copy[lang][1]}</div>
      <img src="data:image/webp;base64,${shot}" style="position:absolute;left:640px;top:70px;width:900px;border-radius:14px;border:1px solid #e3dfd7;box-shadow:0 18px 48px rgba(40,30,20,.16)">
    </body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: root + `og-${lang}.png` });
  }
  await b.close();
})();
