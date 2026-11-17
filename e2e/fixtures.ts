// Test fixtures shared by both targets. `kipple` is the app's page: in the web build a fresh page
// with the sample library (?demo); in the desktop app the window of a running kipple.exe, reached
// through WebView2's DevTools port (KIPPLE_CDP, e.g. http://127.0.0.1:9222).
import { test as base, expect, chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { en } from "../src/i18n/en";
import { ru, type Dict } from "../src/i18n/ru";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An accessible name in either interface language, so the same test reads a Russian or an English app.
 * `prefix` also matches names that go on, like a sidebar item with its count ("All cards 55").
 */
export function ui(pick: (d: Dict) => string | string[], { prefix = false } = {}): RegExp {
  const names = [en, ru].flatMap((d) => pick(d));
  return new RegExp(`^(?:${[...new Set(names)].map(escape).join("|")})${prefix ? "" : "$"}`);
}

type Fixtures = { kipple: Page; openAllCards: () => Promise<void> };

const cdp = process.env.KIPPLE_CDP;
/**
 * Whether the tests run on a real app. Its library may lack a kind of card that the sample library
 * has, so a check may be skipped there; on the sample library a missing card is a failure.
 */
export const onDesktop = !!cdp;

export const test = base.extend<Fixtures>({
  // Desktop target: the browser is the app's WebView2 and the page is its window. Overriding the
  // built-in fixtures keeps Playwright from starting a browser of its own.
  ...(cdp && {
    browser: [
      async ({}, use: (b: Browser) => Promise<void>) => {
        const browser = await chromium.connectOverCDP(cdp);
        await use(browser);
        await browser.close(); // only disconnects: kipple.exe keeps running
      },
      { scope: "worker" },
    ],
    context: async ({ browser }: { browser: Browser }, use: (c: BrowserContext) => Promise<void>) => use(browser.contexts()[0]),
    page: async ({ context }: { context: BrowserContext }, use: (p: Page) => Promise<void>) => {
      const page = context.pages()[0];
      if (!page) throw new Error("No Kipple window found on the DevTools port");
      await use(page);
    },
  }),

  kipple: async ({ page: app }, use, testInfo) => {
    if (cdp) await app.keyboard.press("Escape"); // a panel left open by the previous test
    else await app.goto("./?demo");
    // A fresh install opens on the start screen: the sample library is the same for both targets.
    const demo = app.getByRole("button", { name: ui((d) => d.welcome.demoTitle, { prefix: true }) }).first();
    if (await demo.isVisible().catch(() => false)) await demo.click();
    await expect(app.getByRole("button", { name: ui((d) => d.nav.all, { prefix: true }) })).toBeVisible({ timeout: 20_000 });

    const errors: string[] = [];
    const onError = (e: Error) => errors.push(e.message);
    app.on("pageerror", onError);
    await use(app);
    app.off("pageerror", onError);

    // Kept for every test, passed or not: test-build.ps1 collects them for a look at the build.
    const shot = testInfo.outputPath("screen.png");
    await app.screenshot({ path: shot });
    await testInfo.attach("screen", { path: shot, contentType: "image/png" });
    expect(errors, "uncaught errors in the page").toEqual([]);
  },

  openAllCards: async ({ kipple }, use) => {
    await use(async () => {
      await kipple.getByRole("button", { name: ui((d) => d.nav.all, { prefix: true }) }).click();
      const search = kipple.getByPlaceholder(ui((d) => d.toolbar.search));
      if (await search.inputValue()) await search.fill("");
    });
  },
});

export { expect };
