import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite runs the BUILT theme asset (dist-embed/, from `bun run build:embed`), not
 * the dev server: the two files a merchant installs are the thing under test.
 *
 * No server: every request (the page, the asset, the API, the cart, the CDN) is answered by
 * `page.route` in e2e/harness.ts, so the suite is offline and deterministic.
 *
 * Mobile is WebKit on purpose. `<dialog>`, `position: sticky` and `100dvh` differ there, and
 * Chromium at 390px wide is not a mobile test.
 */
export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: { trace: 'retain-on-failure' },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        { name: 'mobile', use: { ...devices['iPhone 14'] } },
    ],
});
