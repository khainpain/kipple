// Smoke tests for the MVP flows. The same checks run against two targets (see playwright.config.ts):
//   web      the browser build with the sample library (?demo), on every PR in CI;
//   desktop  a real kipple.exe through WebView2's DevTools port (scripts/test-build.ps1).
// In the desktop app this may be the owner's real library, so every step here only reads:
// no edits, no deleting, no import, nothing sent to Telegram. Keep it that way.
import { expect, onDesktop, test, ui } from "./fixtures";

test("app starts with the library in the sidebar", async ({ kipple }) => {
  await expect(kipple.getByRole("button", { name: ui((d) => d.nav.all, { prefix: true }) })).toBeVisible();
});

test("All cards shows the cards", async ({ kipple, openAllCards }) => {
  await openAllCards();
  await expect(kipple.getByRole("heading", { level: 1, name: ui((d) => d.nav.all) })).toBeVisible();
  await expect(kipple.locator("article").first()).toBeVisible();
});

test("search finds a card by a word from its title", async ({ kipple, openAllCards }) => {
  await openAllCards();
  const title = (await kipple.locator("article h3").first().innerText()).trim();
  const word = title.split(/[^\p{L}\p{N}]+/u).find((w) => w.length >= 4) ?? title;
  await kipple.getByPlaceholder(ui((d) => d.toolbar.search)).fill(word);
  await expect(kipple.locator("article h3").filter({ hasText: title }).first()).toBeVisible();
  await expect(kipple.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a kind filter narrows the list", async ({ kipple, openAllCards }) => {
  await openAllCards();
  const filters = kipple.getByRole("button", {
    name: ui((d) => [d.nav.links, d.nav.photos, d.nav.videos, d.nav.docs, d.nav.audio, d.nav.notes]),
  });
  if (onDesktop) test.skip((await filters.count()) < 2, "fewer than two kinds of cards in this library");
  expect(await filters.count()).toBeGreaterThanOrEqual(2);
  const total = await kipple.locator("article").count();
  const filter = filters.first();
  await filter.click();
  try {
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(kipple.locator("article").first()).toBeVisible();
    expect(await kipple.locator("article").count()).toBeLessThanOrEqual(total);
  } finally {
    await filter.click(); // back to everything, so the app is left as it was
  }
  await expect(filter).not.toHaveAttribute("aria-pressed", "true");
});

test("a card opens and closes", async ({ kipple, openAllCards }) => {
  await openAllCards();
  await kipple.locator("article").first().click();
  const panel = kipple.getByRole("complementary", { name: ui((d) => d.detail.label) });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: ui((d) => d.common.close) }).click();
  await expect(panel).toBeHidden();
});

for (const video of [
  { site: "YouTube", query: "youtube", src: /^https:\/\/www\.youtube-nocookie\.com\/embed\// },
  { site: "Instagram", query: "instagram", src: /^https:\/\/www\.instagram\.com\/p\/[^/]+\/embed\/$/ },
]) {
  test(`${video.site} video plays inside the card without shaking`, async ({ kipple, openAllCards }) => {
    await openAllCards();
    await kipple.getByPlaceholder(ui((d) => d.toolbar.search)).fill(video.query);
    // With link previews on, an Instagram reel loads straight away; otherwise there is a Play button first.
    const play = kipple.getByRole("button", { name: ui((d) => d.player.play) }).first();
    const frame = kipple.locator("iframe").filter({ visible: true }).first();
    const cards = kipple.locator("article");
    const n = Math.min(await cards.count(), 8);
    let found = false;
    for (let i = 0; i < n && !found; i++) {
      await cards.nth(i).click();
      found = await expect(play.or(frame))
        .toBeVisible({ timeout: 3000 })
        .then(() => true, () => false);
      if (!found) await kipple.keyboard.press("Escape");
    }
    if (onDesktop) test.skip(!found, `no ${video.site} video in this library`);
    expect(found, `a ${video.site} card with a player`).toBe(true);

    if (await play.isVisible()) await play.click();
    await expect(frame).toHaveAttribute("src", video.src);
    await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(150);

    // Shaking (PR #98): the player must keep its place and size once it has settled.
    await kipple.waitForTimeout(1500);
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      boxes.push(await frame.boundingBox());
      await kipple.waitForTimeout(250);
    }
    for (const b of boxes) expect(b).toEqual(boxes[0]);
  });
}

test("Settings opens and closes without saving", async ({ kipple }) => {
  await kipple.getByRole("button", { name: ui((d) => d.toolbar.settings) }).first().click();
  const title = kipple.getByRole("heading", { level: 2, name: ui((d) => d.settings.title) });
  await expect(title).toBeVisible();
  // Close, never Save or "Hold to delete": in the desktop app these are real settings.
  await kipple.getByRole("banner").filter({ has: title }).getByRole("button", { name: ui((d) => d.common.close) }).click();
  await expect(title).toBeHidden();
});
