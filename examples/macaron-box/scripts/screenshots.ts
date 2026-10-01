/*
 * Regenerate docs/screenshots/ from the dev server.
 *
 *   bunx vite --port 5181 --strictPort     # in one terminal
 *   bun scripts/screenshots.ts              # in another
 *
 * Desktop is Chromium at 1440; mobile is WebKit as an iPhone 14, the same pair the e2e suite
 * runs, so the pictures show what the tests test.
 */
import { chromium, devices, webkit, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5181';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;

async function open(page: Page, query = '') {
    await page.addInitScript(() => {
        sessionStorage.setItem('kitenzo-dev-toolbar', 'closed');
        sessionStorage.removeItem('kitenzo-mock-backend');
    });
    await page.goto(`${BASE}/${query}`);
    await page.locator('[data-cc-product]').first().waitFor();
    // The dev toolbar is for you, not for the README.
    await page.addStyleTag({ content: '.dev-toolbar { display: none !important; }' });
    await page.waitForLoadState('networkidle');
}

const pick = (page: Page, handle: string) => page.locator(`[data-cc-product="${handle}"] [data-testid="cc-pick"]`).click();

async function shoot(page: Page, name: string, fullPage = true) {
    // A full-page capture of a scrolled page draws the theme's sticky header mid-page.
    if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage });
    console.log(`wrote ${name}.png`);
}

async function run(kind: 'desktop' | 'mobile') {
    const browser = kind === 'desktop' ? await chromium.launch() : await webkit.launch();
    const context = await browser.newContext(kind === 'desktop' ? { viewport: { width: 1440, height: 1000 } } : { ...devices['iPhone 14'] });
    const page = await context.newPage();

    await open(page);
    await shoot(page, `${kind}-empty`, kind === 'desktop');

    await page.locator('[data-mcb-size="12"]').click();
    for (const handle of ['raspberry-macaron', 'pistachio-macaron', 'vanilla-macaron', 'rose-macaron', 'chocolate-macaron']) await pick(page, handle);
    if (kind === 'mobile') await page.evaluate(() => window.scrollTo(0, 900));
    await shoot(page, `${kind}-filling`, kind === 'desktop');

    await page.getByTestId('mcb-fill').filter({ visible: true }).first().click();
    if (kind === 'mobile') await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, kind, kind === 'desktop');

    await page.locator('[data-mcb-size="6"]').click();
    await shoot(page, `${kind}-switch`, false);
    await page.keyboard.press('Escape');

    await page.locator('[data-cc-product="raspberry-macaron"] .mcb-card__media').click();
    await shoot(page, `${kind}-dialog`, false);
    await browser.close();
}

await run('desktop');
await run('mobile');
