// Test fixtures shared by both targets. `kipple` is the app's page: in the web build a fresh page
// with the sample library (?demo); in the desktop app the window of a running kipple.exe, reached
// through WebView2's DevTools port (KIPPLE_CDP, e.g. http://127.0.0.1:9222).
import { test as base, expect, chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
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

const cdp = process.env.KIPPLE_CDP;
const isKippleWindow = (p: Page) => /^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)/.test(p.url());

/**
 * Tauri commands the smoke tests must never reach in a real app: everything that changes the Telegram
 * account or the stored keys. Telegram calls that only show the account's state stay allowed.
 */
const READ_ONLY_TG = ["tg_account", "tg_status", "tg_backup_info"];
/** A command that doesn't exist, which a test sends on purpose to check the guard. */
export const PROBE = "tg_smoke_probe";

/**
 * Fails every blocked command instead of running it. Tauri's invoke can't be replaced (the property is
 * read-only), but it reaches Rust as a request to ipc.localhost, which the DevTools port can intercept.
 * A blocked command gets an error answer (not a network error, which would make Tauri retry another way).
 */
async function guardInvoke(page: Page, blocked: string[]) {
  await page.route(/^https?:\/\/ipc\.localhost\//, async (route) => {
    const req = route.request();
    const cmd = decodeURIComponent(new URL(req.url()).pathname.slice(1));
    const writes =
      (cmd.startsWith("tg_") && !READ_ONLY_TG.includes(cmd)) || cmd === "set_secret" || cmd === "delete_secret" || cmd.startsWith("plugin:fs|remove");
    if (req.method() === "OPTIONS" || !writes) return route.continue();
    blocked.push(cmd);
    await route.fulfill({
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "text/plain",
      body: `smoke tests: ${cmd} is blocked`,
    });
  });
}

/** Pages that show the sample library, where every check must find what it looks for. */
const onSample = new WeakSet<Page>();

type Fixtures = { kipple: Page; openAllCards: () => Promise<void>; sampleLibrary: boolean };

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
      await expect.poll(() => context.pages().some(isKippleWindow), { message: "a Kipple window on the DevTools port" }).toBe(true);
      const page = context.pages().find(isKippleWindow)!;
      const blocked: string[] = [];
      await guardInvoke(page, blocked);
      await use(page);
      await page.unrouteAll({ behavior: "wait" });
      expect(blocked.filter((c) => c !== PROBE), "commands that would change Telegram or the keys").toEqual([]);
    },
  }),

  kipple: async ({ page: app }, use, testInfo) => {
    const errors: string[] = [];
    const onError = (e: Error) => errors.push(e.message);
    app.on("pageerror", onError);

    if (cdp) await app.keyboard.press("Escape"); // a panel left open by the previous test
    else await app.goto("./?demo");
    // A fresh install opens on the start screen: then both targets use the sample library.
    const demo = app.getByRole("button", { name: ui((d) => d.welcome.demoTitle, { prefix: true }) }).first();
    const allCards = app.getByRole("button", { name: ui((d) => d.nav.all, { prefix: true }) });
    await expect(demo.or(allCards).first()).toBeVisible({ timeout: 20_000 });
    if (await demo.isVisible()) await demo.click();
    await expect(allCards).toBeVisible();
    // The demo banner's "Exit demo" button is there exactly when the sample library is open.
    if (await app.getByRole("button", { name: ui((d) => d.app.demoExit) }).isVisible()) onSample.add(app);

    try {
      await use(app);
    } finally {
      app.off("pageerror", onError);
      // Kept for every test, passed or not: test-build.ps1 collects them for a look at the build.
      const shot = testInfo.outputPath("screen.png");
      if (await app.screenshot({ path: shot }).then(() => true, () => false)) {
        await testInfo.attach("screen", { path: shot, contentType: "image/png" });
      }
    }
    expect(errors, "uncaught errors in the page").toEqual([]);
  },

  sampleLibrary: async ({ kipple }, use) => use(onSample.has(kipple)),

  openAllCards: async ({ kipple }, use) => {
    await use(async () => {
      await kipple.getByRole("button", { name: ui((d) => d.nav.all, { prefix: true }) }).click();
      const search = kipple.getByPlaceholder(ui((d) => d.toolbar.search));
      if (await search.inputValue()) await search.fill("");
    });
  },
});

export { expect, type Locator };
