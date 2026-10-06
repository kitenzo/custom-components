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

const BASE = process.env.BASE ?? 'http://localhost:5187/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

async function open(page: Page) {
    await page.goto(BASE);
    // A fresh mock cart, and the dev toolbar folded away.
    await page.evaluate(() => {
        sessionStorage.removeItem('kitenzo-mock-backend');
        sessionStorage.setItem('kitenzo-dev-toolbar', 'closed');
    });
    await page.goto(BASE);
    await page.locator('[data-cc-product]').first().waitFor();
    await page.addStyleTag({ content: '.dev-toolbar { display: none !important; }' });
    await settle(page);
}

/** Every photograph loaded (lazy ones included), so no card is captured blank. */
async function settle(page: Page) {
    await page.evaluate(() => {
        for (const image of document.images) image.loading = 'eager';
    });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
}

async function pick(page: Page, handle: string, times: number) {
    for (let index = 0; index < times; index += 1) await page.locator(`[data-cc-product="${handle}"] [data-testid="cc-pick"]`).first().click();
}

/** Scroll until the element sits `gap` pixels below the top of the screen, clear of the theme's sticky header. */
async function scrollTo(page: Page, selector: string, gap: number) {
    await page.evaluate(
        ([target, offset]) => {
            const element = document.querySelector(target as string);
            window.scrollTo(0, element ? element.getBoundingClientRect().top + window.scrollY - (offset as number) : 0);
        },
        [selector, gap] as const,
    );
}

async function shoot(browser: Browser, name: 'desktop' | 'mobile') {
    const phone = name === 'mobile';
    const context = await browser.newContext(phone ? { ...devices['iPhone 14'] } : { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    // The whole page on desktop, so the case and its button are never below the fold. A phone
    // shows one screen, and so does an open dialog, which is centred on the screen.
    const save = async (file: string, screen = phone) => {
        // No hover state left on whatever was pressed last.
        if (!phone) await page.mouse.move(1380, 500);
        await settle(page);
        await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: !screen });
    };

    await open(page);
    await save(`${name}-empty`);

    await page.locator('[data-cc-product="californian-reisling"] .vnc-card__media').click();
    await page.getByTestId('cc-dialog').waitFor();
    await save(`${name}-dialog`, true);
    await page.keyboard.press('Escape');

    // Half a case: three bottles in, three slots still open.
    await pick(page, 'californian-reisling', 2);
    await pick(page, 'pinot-gris', 1);
    if (phone) await scrollTo(page, '[data-cc-product="pinot-gris"]', 62);
    else await page.evaluate(() => window.scrollTo(0, 0));
    await save(name);

    // The full case, which is what unlocks the button.
    await pick(page, 'californian-chardonnay', 2);
    await pick(page, 'californian-verdelho', 1);
    if (phone) await scrollTo(page, '.vnc-summary__heading', 50);
    else await page.evaluate(() => window.scrollTo(0, 0));
    await save(phone ? 'mobile-case' : 'desktop-complete');

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
