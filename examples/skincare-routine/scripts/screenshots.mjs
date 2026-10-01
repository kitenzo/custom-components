/*
 * Regenerate docs/screenshots from the running dev server:
 *
 *   bunx vite --port 5182 --strictPort   # in one terminal
 *   bun run screenshots                  # in another
 *
 * Desktop is Chromium at 1440 wide, full page. The phone is WebKit as an iPhone 14, one screen
 * high, because the sticky bar sits at the foot of the screen and a full-page capture would paint
 * it halfway down the page.
 */
import { chromium, webkit, devices } from '@playwright/test';
const OUT = process.argv[2] ?? 'docs/screenshots';
const BASE = process.env.BASE_URL ?? 'http://localhost:5182/';
/** The state each device's headline screenshot (desktop.png, mobile.png) shows. */
const MAIN = { desktop: '-routine', mobile: '-wizard' };

async function run(name, browserType, ctxOpts, full) {
    const browser = await browserType.launch();
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const go = async (q = '') => {
        await page.goto(BASE + q);
        await page.addStyleTag({ content: '.dev-toolbar{display:none!important}' });
        await page.waitForSelector('[data-testid="cc-quiz"], [data-testid="cc-wizard"]');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(800);
    };
    const shot = async (state, fullPage = full) => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${state === MAIN[name] ? name : name + state}.png`, fullPage });
    };
    await go();
    await page.evaluate(() => window.__KITENZO_MOCK__?.reset());
    await shot('-quiz');
    await page.getByTestId('cc-quiz-start').click();
    await page.click('[data-cc-answer="q1a1"]');
    await page.waitForTimeout(500);
    await shot('-question');
    await page.click('[data-cc-answer="q2a2"]');
    await page.waitForTimeout(500);
    await page.click('[data-cc-answer="q3a1"]');
    await page.waitForSelector('[data-testid="cc-routine"]');
    await shot('-routine');
    await page.getByTestId('cc-routine-adjust').click();
    await shot('-wizard');
    await page.locator('[data-cc-product="ceramide-oat-cream-cleanser"] .skr-card__media').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}-dialog.png` });
    await page.keyboard.press('Escape');
    await go();
    await page.getByTestId('cc-quiz-skip').click();
    await shot('-empty');
    await page.locator('[data-cc-product="ceramide-oat-cream-cleanser"] [data-testid="cc-pick"]').click();
    await page.waitForTimeout(900);
    await shot('-part-filled');
    console.log(name, errors.length ? errors : 'no errors');
    await browser.close();
}
await run('desktop', chromium, { viewport: { width: 1440, height: 900 } }, true);
await run('mobile', webkit, { ...devices['iPhone 14'] }, false);
