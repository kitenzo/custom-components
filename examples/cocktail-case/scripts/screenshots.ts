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

const BASE = process.env.BASE ?? 'http://localhost:5183/';
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
    const save = async (state: string) => {
        // No hover state left on whatever was pressed last.
        if (name === 'desktop') await page.mouse.move(700, 880);
        await page.screenshot({ path: `${OUT}/${name}${state ? `-${state}` : ''}.png` });
    };

    await open(page);
    await save('empty');

    // Part-filled, then filtered: a can in the case stays visible outside the filter.
    await pick(page, 'passionfruit-mojito', 2);
    await pick(page, 'pear-cardamom', 1);
    await pick(page, 'grapefruit-rosemary', 1);
    await page.locator('[data-ckc-facet="Flavor_citrus"]').click();
    await settle(page);
    await save('filtered');
    await page.getByTestId('ckc-clear-filters').click();

    // "Surprise me" twice: to the 6-can minimum, then to the 12-can tier.
    await page.getByTestId('ckc-surprise').click();
    await page.getByTestId('ckc-surprise').click();
    await page.evaluate((phone) => {
        for (const row of document.querySelectorAll('.ckc-facets__chips')) row.scrollLeft = 0;
        // On a phone, open on the cans rather than the heading.
        const facets = document.querySelector('.ckc-facets');
        window.scrollTo(0, phone && facets ? facets.getBoundingClientRect().top + window.scrollY - 76 : 0);
    }, name === 'mobile');
    await settle(page);
    await save('');

    // Join the club.
    await page.locator('[data-ckc-plan="71"]').check();
    await page.locator('label:has([data-ckc-frequency="4-weeks"])').click();
    await page.locator('[data-ckc-email]').fill('sam@example.com');
    await page.locator('[data-ckc-email]').blur();
    await page.locator('.ckc-plan').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await save('club');

    await page.locator('[data-cc-product="pear-cardamom"] .ckc-card__media').click();
    await page.waitForFunction(() => [...document.querySelectorAll('dialog img')].every((image) => (image as HTMLImageElement).complete), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await save('dialog');
    await page.keyboard.press('Escape');

    // A reminder email's reorder link.
    await open(page, '?subscription=sub_demo_club');
    await pick(page, 'raspberry-hibiscus', 3);
    await pick(page, 'yuzu-elderflower', 3);
    await page.evaluate(() => window.scrollTo(0, 0));
    await save('reorder');

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
