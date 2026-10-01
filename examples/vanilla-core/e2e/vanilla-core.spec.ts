/*
 * What this example does that the conformance suite does not ask of every component: the case
 * that fills, and the jobs the React hooks did that this widget now does itself (the theme
 * editor's draft preview, ids that stay unique), plus the
 * point of the exercise: the asset is small and framework-free.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import { buyButton, completeSelection, openWidget, pick, requestsTo, widget } from './harness';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test.describe('the case', () => {
    test('fills a slot per bottle, says how full it is in words, and is full at six', async ({ page }) => {
        await openWidget(page);
        const rail = page.locator('.vnc-summary');
        await expect(rail.locator('.vnc-slot')).toHaveCount(6);
        await expect(rail.locator('.vnc-slot[data-filled]')).toHaveCount(0);
        await pick(page, 'californian-reisling', 2);
        await pick(page, 'pinot-gris');
        await expect(rail.locator('.vnc-slot[data-filled]')).toHaveCount(3);
        await expect(rail.locator('.vnc-case__caption')).toHaveText('3 of 6 bottles');
        await pick(page, 'californian-chardonnay', 3);
        await expect(rail.locator('.vnc-case')).toHaveClass(/vnc-case--full/);
        // The bar's small case fills with the same bottles.
        await expect(page.getByTestId('cc-mobile-bar').locator('.vnc-slot[data-filled]')).toHaveCount(6);
    });
});

test.describe('without the hooks', () => {
    test('the theme editor previews a draft bundle, and still refuses to sell it', async ({ page }) => {
        // `<KitenzoProvider>` turned preview on by itself in the editor; here the client is told.
        const { backend } = await openWidget(page, { scenarios: ['draft-bundle'] });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        expect(requestsTo(backend, /\/bundles\/\d+$/).every((request) => request.query.preview === '1')).toBe(true);
        await completeSelection(page);
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.vnc-status').filter({ visible: true }).first()).toContainText('draft');
        await buyButton(page).click({ force: true });
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);
    });

    test('two widgets on one page share no element id, so labels and the dialog title point at their own', async ({ page }) => {
        await openWidget(page, { sections: 2 });
        await expect(page.locator('#kitenzo-2 [data-cc-product]').first()).toBeVisible();
        const ids = await page.locator('[data-testid="cc-root"] [id]').evaluateAll((elements) => elements.map((element) => element.id));
        expect(ids.length).toBeGreaterThan(0);
        expect(ids.length).toBe(new Set(ids).size);
    });

    test('"Stay on this page" announces the add to the theme and stays', async ({ page }) => {
        await openWidget(page, { content: { afterAdd: 'stay' } });
        await page.evaluate(() => document.addEventListener('kitenzo:bundle-added', () => (document.body.dataset.added = '1')));
        await completeSelection(page);
        await buyButton(page).click();
        await expect(buyButton(page)).toHaveText('Added to your cart');
        expect(await page.evaluate(() => document.body.dataset.added)).toBe('1');
        await expect(page).not.toHaveURL(/\/cart$/);
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
    });
});

test.describe('the asset', () => {
    test('ships no framework, at about a third of the React starter\'s weight', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'one file, measured once');
        const js = readFileSync(resolve(ROOT, 'dist-embed/kitenzo-vanilla-core.js'));
        // React's element marker and its internals: present in any build that bundles React.
        expect(js.includes('react.element')).toBe(false);
        expect(js.includes('__SECRET_INTERNALS')).toBe(false);
        // The React starter is about 72 KB gzipped. A budget, so a stray dependency is noticed.
        expect(gzipSync(js, { level: 9 }).length).toBeLessThan(30 * 1024);
    });
});
