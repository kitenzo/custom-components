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

const BASE = process.env.BASE ?? 'http://localhost:5173/';
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

async function shoot(browser: Browser, name: 'desktop' | 'mobile') {
    const context = await browser.newContext(name === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices['iPhone 14'] });
    const page = await context.newPage();

    await open(page);

    // A valid box: three smoothies from the first step and one vitamin shot from the second.
    await pick(page, 'strawberries-cream', 2);
    await pick(page, 'pineapple-mango', 1);
    await pick(page, 'almond-oat-vitamin-enhanced', 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    // No hover state left on whatever was pressed last.
    if (name === 'desktop') await page.mouse.move(700, 880);
    // Desktop runs a little past the first screen, to the foot of the first step's second row.
    await page.screenshot({ path: `${OUT}/${name}.png`, ...(name === 'desktop' ? { fullPage: true, clip: { x: 0, y: 0, width: 1440, height: 1000 } } : {}) });

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
