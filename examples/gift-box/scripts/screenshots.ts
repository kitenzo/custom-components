/*
 * Regenerate docs/screenshots from the dev server.
 *
 *   bun run dev             # in one terminal (the port is in vite.config.ts)
 *   bun run screenshots     # in another
 *
 * Desktop is Chromium at 1440 wide; mobile is WebKit as an iPhone 14, the same pair the e2e suite
 * runs. Every state is reached by pressing the widget's own controls and typing into its fields,
 * never by injecting state.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices, webkit, type Browser, type Page } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5184/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

const BOX = 'keepsake-gift-box';
const CANDLE = 'hand-poured-soy-candle';
const TEA = 'loose-leaf-tea-tin';
const CHOCOLATE = 'small-batch-chocolate-bar';
const MATCHBOX = 'engravable-brass-matchbox';
const WITH_LOVE = 'with-love-letterpress-card';
const NEW_HOME = 'new-home-letterpress-card';

/** Open the builder. `fresh` empties the mock cart; without it the cart from earlier adds is kept. */
async function open(page: Page, fresh = true) {
    await page.goto(BASE);
    await page.evaluate((empty) => {
        if (empty) sessionStorage.removeItem('kitenzo-mock-backend');
        sessionStorage.setItem('kitenzo-dev-toolbar', 'closed');
    }, fresh);
    await page.goto(BASE);
    await ready(page);
}

/** The widget is up, the dev toolbar is out of the picture, and the product art is drawn. */
async function ready(page: Page) {
    await page.locator('[data-cc-product]').first().waitFor();
    await page.addStyleTag({ content: '.dev-toolbar { display: none !important; }' });
    await settle(page);
}

/** Every image loaded (lazy ones included), so no card is captured blank. */
async function settle(page: Page) {
    await page.evaluate(() => {
        for (const image of document.images) image.loading = 'eager';
    });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
}

const product = (page: Page, handle: string) => page.locator(`[data-cc-product="${handle}"]`).first();

async function pick(page: Page, handle: string) {
    await product(page, handle).getByTestId('cc-pick').click();
}

/** Press one option value (a size, a colour) on a product's card. */
async function choose(page: Page, handle: string, value: string) {
    await product(page, handle).locator(`[data-option-value="${value}"]`).click();
}

const field = (page: Page, handle: string, label: string) => page.locator(`[data-cc-personalise="${handle}"]`).first().getByLabel(label, { exact: true });

async function write(page: Page, handle: string, label: string, value: string) {
    await field(page, handle, label).fill(value);
}

/** Scroll so the element's top edge sits `offset` pixels below the top of the viewport. */
async function scrollTo(page: Page, selector: string, offset: number) {
    await page.locator(selector).first().evaluate((element, gap) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - gap), offset);
    await page.waitForTimeout(300);
}

const buyButton = (page: Page) => page.getByTestId('cc-add-to-cart').filter({ visible: true }).first();

async function addAndGoToCart(page: Page) {
    await buyButton(page).click();
    await page.waitForURL('**/cart');
    await page.locator('#cart table').waitFor();
}

async function desktop(browser: Browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const save = async (file: string, fullPage = false) => {
        // No hover state left on whatever was pressed last.
        await page.mouse.move(1430, 890);
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/${file}.png`, fullPage });
    };

    await open(page);
    await save('desktop-empty');

    // A matchbox in the box and nothing engraved: pressing the buy button is refused, and the
    // widget takes the shopper to the field.
    await pick(page, BOX);
    await pick(page, CANDLE);
    await pick(page, MATCHBOX);
    await buyButton(page).click({ force: true });
    await page.waitForTimeout(900);
    await save('desktop-missing-engraving');

    // The finished box: Classic / Terracotta, an engraving and a card message.
    await open(page);
    await choose(page, BOX, 'Classic');
    await choose(page, BOX, 'Terracotta');
    await pick(page, BOX);
    await pick(page, CANDLE);
    await pick(page, CHOCOLATE);
    await pick(page, MATCHBOX);
    await pick(page, WITH_LOVE);
    await write(page, MATCHBOX, 'Lid engraving', 'R & J 2026');
    await write(page, WITH_LOVE, 'Your message', 'Happy anniversary, my love. Here is to ten more years of tea in bed. R x');
    await field(page, WITH_LOVE, 'Your message').blur();
    await scrollTo(page, `.gft-personal:has([data-cc-personalise="${MATCHBOX}"])`, 340);
    await save('desktop-personalise');

    // A full-page capture of a scrolled page draws the theme's sticky header mid-page.
    await field(page, WITH_LOVE, 'Your message').focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await save('desktop', true);

    // Two gift boxes into one cart, each with its own engraving and message.
    await open(page);
    await pick(page, BOX);
    await pick(page, CANDLE);
    await pick(page, CHOCOLATE);
    await pick(page, MATCHBOX);
    await pick(page, WITH_LOVE);
    await write(page, MATCHBOX, 'Lid engraving', 'R & J 2026');
    await write(page, WITH_LOVE, 'Your message', 'Happy anniversary, love R');
    await addAndGoToCart(page);

    await open(page, false);
    await choose(page, BOX, 'Grand');
    await pick(page, BOX);
    await pick(page, TEA);
    await pick(page, CHOCOLATE);
    await pick(page, MATCHBOX);
    await pick(page, NEW_HOME);
    await write(page, MATCHBOX, 'Lid engraving', 'MUM');
    await write(page, NEW_HOME, 'Your message', 'Welcome home. Love from all of us');
    await addAndGoToCart(page);
    // Taken twice: Chromium settles the page's fonts while it takes a full-page capture, which
    // makes the page shorter, so the first capture ends in a blank strip.
    await save('cart-two-boxes', true);
    await save('cart-two-boxes', true);

    // The cart's Edit link for the second box: it opens with its own engraving and message
    // already in their fields.
    await page.locator('a[href*="edit="]').nth(1).click();
    await ready(page);
    await field(page, MATCHBOX, 'Lid engraving').waitFor();
    await scrollTo(page, `.gft-personal:has([data-cc-personalise="${MATCHBOX}"])`, 340);
    await save('desktop-edit');

    await context.close();
}

async function mobile(browser: Browser) {
    const context = await browser.newContext({ ...devices['iPhone 14'] });
    const page = await context.newPage();
    const save = async (file: string) => {
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/${file}.png` });
    };

    await open(page);
    await save('mobile');

    // The engraving field under the matchbox, being typed into.
    await pick(page, BOX);
    await pick(page, CANDLE);
    await pick(page, MATCHBOX);
    await write(page, MATCHBOX, 'Lid engraving', 'R & J 2026');
    await scrollTo(page, `.gft-personal:has([data-cc-personalise="${MATCHBOX}"])`, 413);
    await save('mobile-personalise');

    // The box preview in the summary, with what was written under each line.
    await pick(page, WITH_LOVE);
    await write(page, WITH_LOVE, 'Your message', 'Happy anniversary. Here is to ten more years of tea in bed. R x');
    await field(page, WITH_LOVE, 'Your message').blur();
    await scrollTo(page, '.gft-tray', 67);
    await save('mobile-box-preview');

    await scrollTo(page, `[data-cc-product="${TEA}"]`, 80);
    await product(page, TEA).locator('.gft-card__media').click();
    await page.locator('dialog[open]').waitFor();
    await page.waitForTimeout(500);
    await save('mobile-dialog');

    await context.close();
}

mkdirSync(OUT, { recursive: true });
const chrome = await chromium.launch();
await desktop(chrome);
await chrome.close();
const safari = await webkit.launch();
await mobile(safari);
await safari.close();
console.log(`Screenshots written to ${OUT}`);
