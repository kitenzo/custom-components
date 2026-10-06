/*
 * Regenerate docs/screenshots from the dev server.
 *
 *   bun run dev             # in one terminal (the port is in vite.config.ts)
 *   bun run screenshots     # in another
 *
 * Desktop is Chromium at 1440 wide, full page. Mobile is WebKit as an iPhone 14, the same pair the
 * e2e suite runs, and one screen high: the buy bar sticks to the foot of the screen, and a
 * full-page capture would paint it halfway down the page. Every state is reached by pressing the
 * widget's own controls, never by injecting state.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, devices, webkit, type Browser, type Page } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5182/';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');
/** The state each device's headline picture (desktop.png, mobile.png) shows. */
const MAIN = { desktop: 'routine', mobile: 'wizard' };

async function open(page: Page) {
    await page.goto(BASE);
    // A fresh mock cart, and the dev toolbar folded away.
    await page.evaluate(() => {
        sessionStorage.removeItem('kitenzo-mock-backend');
        sessionStorage.setItem('kitenzo-dev-toolbar', 'closed');
    });
    await page.goto(BASE);
    // The widget opens on the quiz, before any product is on screen.
    await page.locator('[data-testid="cc-quiz"]').waitFor();
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
    const save = async (state: string, fullPage = name === 'desktop') => {
        await settle(page);
        // No hover state left on whatever was pressed last.
        if (name === 'desktop') await page.mouse.move(700, 880);
        await page.screenshot({ path: `${OUT}/${name}${state === MAIN[name] ? '' : `-${state}`}.png`, fullPage });
    };
    const fromTop = async (state: string) => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await save(state);
    };

    await open(page);
    await fromTop('quiz');

    // Dry, dullness, mornings: a routine with a reason for each product.
    await page.getByTestId('cc-quiz-start').click();
    await page.locator('[data-cc-answer="q1a1"]').click();
    await page.locator('[data-cc-answer^="q2"]').first().waitFor();
    await fromTop('question');
    await page.locator('[data-cc-answer="q2a2"]').click();
    await page.locator('[data-cc-answer^="q3"]').first().waitFor();
    await page.locator('[data-cc-answer="q3a1"]').click();
    await page.getByTestId('cc-routine').waitFor();
    await fromTop('routine');

    await page.getByTestId('cc-routine-adjust').click();
    await page.getByTestId('cc-wizard').waitFor();
    await fromTop('wizard');

    await page.locator('[data-cc-product="ceramide-oat-cream-cleanser"] .skr-card__media').click();
    await page.waitForFunction(() => [...document.querySelectorAll('dialog img')].every((image) => (image as HTMLImageElement).complete), null, { timeout: 15_000 }).catch(() => {});
    await save('dialog', false);
    await page.keyboard.press('Escape');

    // Without the quiz: an empty wizard, then one pick, which advances to the second step.
    await open(page);
    await page.getByTestId('cc-quiz-skip').click();
    await page.getByTestId('cc-wizard').waitFor();
    await fromTop('empty');
    await pick(page, 'ceramide-oat-cream-cleanser', 1);
    await page.waitForTimeout(900);
    await fromTop('part-filled');

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
