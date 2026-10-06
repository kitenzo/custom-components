/*
 * Regenerate docs/screenshots from the dev server.
 *
 *   bun run dev             # in one terminal (the port is in vite.config.ts)
 *   bun run screenshots     # in another
 *
 * Desktop is Chromium at 1440 wide; mobile is WebKit as an iPhone 14, the same pair the e2e suite
 * runs. Every state is reached by pressing the widget's own controls, never by injecting state.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices, webkit, type Browser, type Page } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5186/';
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
    await page.addStyleTag({ content: '.dev-toolbar { display: none !important; }' });
    await settle(page);
}

/** Every photograph loaded (lazy ones included) and the theme's web font in, so nothing is captured blank or in a fallback face. */
async function settle(page: Page) {
    await page.evaluate(async () => {
        for (const image of document.images) image.loading = 'eager';
        await document.fonts.ready;
    });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
}

async function pick(page: Page, handle: string, times: number) {
    for (let index = 0; index < times; index += 1) await page.locator(`[data-cc-product="${handle}"] [data-testid="cc-pick"]`).first().click();
}

/** Three pouches, two flavours: the second tier in force and the third one pouch away. */
async function partFill(page: Page) {
    await pick(page, 'chocolate-whey-protein', 2);
    await pick(page, 'vanilla-whey-protein', 1);
    await page.getByTestId('vol-progress').getByText('Add 1 more to save 20%').waitFor();
}

async function shoot(browser: Browser, name: 'desktop' | 'mobile') {
    const desktop = name === 'desktop';
    const context = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 } } : { ...devices['iPhone 14'] });
    const page = await context.newPage();
    const save = async (state: string) => {
        // No hover state left on whatever was pressed last.
        if (desktop) await page.mouse.move(850, 880);
        await settle(page);
        await page.screenshot({ path: `${OUT}/${name}-${state}.png` });
    };
    // Where a picture opens: the top of the page on desktop; on a phone the widget, just under the
    // theme's sticky header, because the product photos fill the first screen there.
    const top = () =>
        page.evaluate((wide) => {
            const widget = document.querySelector('[data-testid="cc-root"]');
            window.scrollTo(0, wide || !widget ? 0 : widget.getBoundingClientRect().top + window.scrollY - 70);
        }, desktop);

    // The ladder in the product page's column: empty, part-filled, then at the top tier.
    await open(page);
    await top();
    await save('empty');

    await partFill(page);
    await top();
    await save('part');
    // The README's lead pictures, under their short names.
    copyFileSync(`${OUT}/${name}-part.png`, `${OUT}/${name}.png`);

    // Peanut butter has 3 left, so its stepper stops there: six pouches across three flavours.
    await pick(page, 'peanut-butter-whey-protein', 3);
    await page.getByTestId('vol-progress').getByText('Best price unlocked').waitFor();
    await top();
    await save('complete');

    // A flavour's details, opened from its photograph.
    await page.locator('[data-cc-product="chocolate-whey-protein"] .vol-details').first().click();
    await page.getByTestId('cc-dialog').waitFor();
    // On a phone the press scrolled the flavour into view; the picture is of the dialog over the top of the widget.
    await top();
    await save('dialog');
    await page.keyboard.press('Escape');

    // The section's Layout setting on Grid. Desktop shows the cards and the buy panel at the foot
    // of the page; the phone shows the ladder above the first row of cards.
    await open(page, '?layout=grid');
    await partFill(page);
    await page.evaluate((wide) => {
        const ladder = document.querySelector('.vol-ladder');
        window.scrollTo(0, wide || !ladder ? document.documentElement.scrollHeight : ladder.getBoundingClientRect().top + window.scrollY - 70);
    }, desktop);
    await save('grid-part');

    // A shopper in Japan: every amount, ladder rows included, in a currency with no decimals.
    if (desktop) {
        await open(page, '?scenario=market-jpy');
        await partFill(page);
        await top();
        await save('market-jpy-part');
    }

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
