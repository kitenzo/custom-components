/*
 * Regenerate docs/screenshots from the dev server.
 *
 *   bun run dev             # in one terminal (the port is in vite.config.ts)
 *   bun run screenshots     # in another
 *
 * Desktop is Chromium at 1440 wide; mobile is WebKit as an iPhone 14, the same pair the e2e suite
 * runs. Every state is reached by pressing the widget's own controls, never by injecting state.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices, webkit, type Browser, type Page } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5185/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

async function open(page: Page, query = '') {
    await page.goto(BASE);
    // A fresh mock cart, and the dev toolbar folded away.
    await page.evaluate(() => {
        sessionStorage.removeItem('kitenzo-mock-backend');
        sessionStorage.setItem('kitenzo-dev-toolbar', 'closed');
    });
    await page.goto(BASE + query);
    await page.locator('[data-cc-product]').first().waitFor();
    // The stand-in theme's header scrolls away with the page, so a scrolled phone picture is all widget.
    await page.addStyleTag({ content: '.dev-toolbar { display: none !important; } .theme-header { position: static !important; }' });
    await settle(page);
}

/** Every photograph loaded (lazy ones included), so no piece is captured blank. */
async function settle(page: Page) {
    await page.evaluate(() => {
        for (const image of document.images) image.loading = 'eager';
    });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
}

const piece = (page: Page, handle: string) => page.locator(`[data-cc-product="${handle}"]`).first();
const choose = (page: Page, handle: string, option: string, value: string) => piece(page, handle).locator(`[data-option="${option}"][data-value="${value}"]`).click();
const add = (page: Page, handle: string) => piece(page, handle).getByTestId('cc-pick').click();

/** Put an element a few pixels below the top of a phone's screen. */
async function scrollTo(page: Page, selector: string, offset = 0) {
    await page.locator(selector).first().evaluate((element, gap) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - gap), offset);
}

async function shoot(browser: Browser, name: 'desktop' | 'mobile') {
    const desktop = name === 'desktop';
    const context = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 } } : { ...devices['iPhone 14'] });
    const page = await context.newPage();
    // Desktop pictures show the whole page; a phone shows one screen of it, and a dialog is one screen on both.
    const save = async (file: string, fullPage = desktop) => {
        // No hover state left on whatever was pressed last.
        if (desktop) await page.mouse.move(1420, 880);
        await settle(page);
        await page.screenshot({ path: `${OUT}/${file}.png`, fullPage });
    };

    // First paint: nothing chosen, and the set price already showing.
    await open(page);
    await save(desktop ? 'desktop-empty' : 'mobile');

    // A size on the leggings: Moss is sold out in XS, and the grid says so.
    await choose(page, 'power-leggings', 'Size', 'XS');
    if (!desktop) {
        await scrollTo(page, '[data-cc-product="power-leggings"] .aws-piece__heading', 4);
        await save('mobile-options');
    }

    // The top in the set, then "Match colours" in Moss: the leggings keep their XS and are reported.
    await choose(page, 'oversized-drop-tee', 'Size', 'M');
    await add(page, 'oversized-drop-tee');
    await page.locator('[data-match="Moss"]').click();
    await page.getByTestId('aws-match-result').getByText('Not available in Moss').waitFor();
    if (desktop) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await save('desktop-match');
    }

    // The complete set: the leggings go in, then swap to Slate, which adds its surcharge.
    await choose(page, 'form-sports-bra', 'Size', 'S');
    await add(page, 'form-sports-bra');
    await add(page, 'power-leggings');
    await choose(page, 'power-leggings', 'Colour', 'Slate');
    await page.getByTestId('aws-surcharge-line').filter({ visible: true }).first().waitFor();
    if (desktop) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await save('desktop');
    } else {
        await scrollTo(page, '.aws-summary');
        await save('mobile-complete');
    }

    // A piece's details, opened from its photograph.
    await page.evaluate(() => window.scrollTo(0, 0));
    await piece(page, 'power-leggings').locator('.aws-piece__media').click();
    await page.getByTestId('cc-dialog').waitFor();
    await save(`${name}-dialog`, false);
    await page.keyboard.press('Escape');

    await context.close();
}

mkdirSync(OUT, { recursive: true });
const desktop = await chromium.launch();
await shoot(desktop, 'desktop');
await desktop.close();
const mobile = await webkit.launch();
await shoot(mobile, 'mobile');
await mobile.close();
console.log(`Screenshots written to ${OUT}`);
