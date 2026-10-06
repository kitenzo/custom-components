/*
 * What this example does that the conformance suite does not ask of every component: the case
 * that fills, the jobs a React widget leaves to the provider and to React that this one does
 * itself (the theme editor's draft preview, ids that stay unique, updating one card and not the
 * shelf, a load nobody is waiting for any more), and the point of the exercise: the asset is small
 * and framework-free.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import { variantBundleId } from '../dev/mock/backend';
import type { Fixture } from '../dev/mock/wire';
import { buyButton, completeSelection, openWidget, pick, product, requestsTo, widget } from './harness';

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

test.describe('the total', () => {
    const rail = (page: Page) => page.locator('.vnc-summary');
    // The rail's or the bar's, whichever this width shows.
    const shown = (page: Page) => page.getByTestId('cc-price').filter({ visible: true });

    test('is hidden for an empty case, then is the SDK\'s price: the bottles, less £10 off the case', async ({ page }) => {
        await openWidget(page);
        // £10 off depends on what goes in, so an empty case has no price to show.
        await expect(page.locator('.vnc-price').filter({ visible: true })).toHaveCount(0);
        await pick(page, 'californian-reisling', 4); // 12.99 each
        await pick(page, 'pinot-gris', 2); // 11.50 each
        await expect(shown(page).first()).toHaveText('£64.96');
        await expect(rail(page).getByTestId('cc-price')).toHaveText('£64.96');
        await expect(rail(page).getByTestId('cc-price')).toHaveAttribute('data-price-value', '64.96');
        await expect(rail(page).getByTestId('cc-compare-at')).toHaveText('£74.96');
        await expect(rail(page).getByTestId('cc-saving')).toContainText('£10.00');
        await expect(rail(page).getByTestId('cc-saving')).toHaveAttribute('data-price-value', '10.00');
        // The bar shows the same total.
        await expect(page.getByTestId('cc-mobile-bar').getByTestId('cc-price')).toHaveText('£64.96');
    });

    test('shows a set price before the first pick, with nothing struck through', async ({ page }) => {
        await openWidget(page, {
            change: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'price', value: '60.00' } } }),
        });
        await expect(rail(page).getByTestId('cc-price')).toHaveText('£60.00');
        await expect(shown(page).first()).toHaveText('£60.00');
        await expect(rail(page).getByTestId('cc-compare-at')).toBeHidden();
        await expect(rail(page).getByTestId('cc-saving')).toBeHidden();
    });

    test('shows that set price in the shopper\'s market, at the market\'s rate', async ({ page }) => {
        await openWidget(page, {
            scenarios: ['market-jpy'],
            change: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'price', value: '60.00' } } }),
        });
        // The shop's £60 converted: never 60 with a yen sign.
        await expect(shown(page).first()).toHaveText(/^¥\d{2},\d{3}$/);
    });

    test('carries the number it shows in a zero-decimal currency, not the price before rounding', async ({ page }) => {
        await openWidget(page, { scenarios: ['market-jpy'] });
        await pick(page, 'californian-reisling', 4);
        await pick(page, 'pinot-gris', 2);
        // The case comes to 12342.05 yen before it is rounded to a price a shopper can pay.
        await expect(rail(page).getByTestId('cc-price')).toHaveText('¥12,342');
        await expect(rail(page).getByTestId('cc-price')).toHaveAttribute('data-price-value', '12342.00');
    });
});

test.describe('a cap on one wine', () => {
    // The SDK tells the two caps apart; each has its own sentence in the section's settings.
    for (const [type, sentence] of [
        ['amount-of-one-product', 'the most of this wine'],
        ['amount-of-one-variant', 'the most of this one'],
    ] as const) {
        test(`"at most 2" (${type}) refuses the third bottle and says why`, async ({ page }) => {
            await openWidget(page, {
                change: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type, value: '2.00' }] } }),
            });
            await pick(page, 'californian-reisling', 2);
            const card = product(page, 'californian-reisling');
            await card.getByTestId('cc-pick').click({ force: true });
            await expect(card).toHaveAttribute('data-cc-quantity', '2');
            await expect(card.locator('[role="status"]')).toContainText(sentence);
            // Another wine still goes in: the case is not full, this wine is.
            await pick(page, 'pinot-gris');
            await expect(product(page, 'pinot-gris')).toHaveAttribute('data-cc-quantity', '1');
        });
    }
});

/** The impressions the widget posted, with the page each was posted from. */
function watchImpressions(page: Page) {
    const impressions: { from: string; body: unknown }[] = [];
    page.on('request', (request) => {
        if (request.url().endsWith('/ab-tests/impression')) impressions.push({ from: new URL(request.frame().url()).pathname, body: request.postDataJSON() });
    });
    return impressions;
}

test.describe('an A/B test', () => {
    test('a shopper assigned the other variant goes to its page, and is counted there, once, when the case is on screen', async ({ page }) => {
        const impressions = watchImpressions(page);
        const { backend, fixtures } = await openWidget(page, { scenarios: ['ab-other-variant'], query: '?utm_source=email' });
        const variant = variantBundleId(fixtures[0]!.bundle.id);
        // The page's own query rides along, so the campaign that brought the shopper is not lost.
        await expect(page).toHaveURL(new RegExp(`/pages/variant-b\\?bundle=${variant}&utm_source=email$`));
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        // What core does unasked: the same visitor on both pages, and the variant's page told which test sent them.
        const [first, second] = requestsTo(backend, /\/bundles\/\d+$/);
        expect(first!.query.visitor_id).toBeTruthy();
        expect(second!.query).toMatchObject({ visitor_id: first!.query.visitor_id, ab_routed: '5' });
        await expect.poll(() => impressions).toEqual([{ from: '/pages/variant-b', body: { bundleId: variant, visitorId: first!.query.visitor_id } }]);
    });

    test('the merchant previewing from the admin is not counted, and their case is not credited to the test', async ({ page }) => {
        const impressions = watchImpressions(page);
        const { backend } = await openWidget(page, { scenarios: ['ab-stays'] });
        // A shopper is counted, so the silence that follows is the preview's and not a test nobody is in.
        await expect.poll(() => impressions.length).toBe(1);
        await openWidget(page, { backend, query: '?ab_bypass=true' });
        await completeSelection(page);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(impressions).toHaveLength(1);
        expect(backend.state.cart.items.length).toBeGreaterThan(0);
        expect(backend.state.cart.items.some((item) => '_ab_test_routed' in item.properties)).toBe(false);
    });
});

test.describe('a load nobody is waiting for', () => {
    const settle = (page: Page) => page.evaluate(() => new Promise((done) => setTimeout(done, 300)));

    // The section can go two ways while the API is answering: the theme editor unloads it and says
    // so, or the theme's own navigation drops it from the page and says nothing.
    const ways: [string, () => void][] = [
        ['the theme editor unloaded', () => void document.querySelector('.shopify-section')!.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }))],
        ['the theme dropped from the page', () => document.querySelector('[data-vanilla-core-bundle]')!.remove()],
    ];
    for (const [how, leave] of ways) {
        test(`a section ${how} mid-load sends the shopper nowhere`, async ({ page }) => {
            const impressions = watchImpressions(page);
            await openWidget(page, { scenarios: ['ab-other-variant', 'slow-api'] });
            const answered = page.waitForResponse(/\/bundles\/\d+(\?|$)/);
            await page.evaluate(leave);
            await answered;
            await settle(page);
            expect(new URL(page.url()).pathname).toBe('/');
            expect(impressions).toEqual([]);
        });
    }

    test('a case drawn into a section that has left the page counts nobody', async ({ page }) => {
        const impressions = watchImpressions(page);
        await openWidget(page, { scenarios: ['ab-stays'] });
        // A shopper who sees the case is counted, so the silence that follows is the missing section's.
        await expect.poll(() => impressions.length).toBe(1);

        // Again, with the shop's settings slow to answer: the bundle is here and the case is not drawn yet.
        await page.route('**/api/headless/v1/settings*', async (route) => {
            await new Promise((done) => setTimeout(done, 1200));
            await route.fallback();
        });
        const bundle = page.waitForResponse(/\/bundles\/\d+(\?|$)/);
        const products = page.waitForResponse(/\/bundles\/\d+\/products/);
        const settings = page.waitForResponse(/\/settings/);
        await page.reload();
        await Promise.all([bundle, products]);
        await settle(page);
        await page.evaluate(() => document.querySelector('[data-vanilla-core-bundle]')!.remove());
        await settings;
        await settle(page);
        expect(impressions).toHaveLength(1);
    });
});

/** Californian Chardonnay in two sizes, as the API serialises a product with one option. */
function inTwoSizes(fixture: Fixture): Fixture {
    return {
        ...fixture,
        products: fixture.products.map((entry) => {
            if (entry.handle !== 'californian-chardonnay') return entry;
            const bottle = entry.variants[0]!;
            return {
                ...entry,
                options: [{ name: 'Size', position: 1, values: ['Bottle', 'Magnum'] }],
                variants: [
                    { ...bottle, title: 'Bottle', optionValues: ['Bottle'] },
                    { ...bottle, title: 'Magnum', optionValues: ['Magnum'], price: '24.00', sku: `${bottle.sku}-M`, shopifyVariantId: '990001', shopifyVariantGid: 'gid://shopify/ProductVariant/990001' },
                ],
            };
        }),
    };
}

test.describe('one wine\'s own changes', () => {
    // Every update writes what it drew, so a card whose price was scribbled over shows whether an
    // update reached it: an update puts the price back.
    const price = (page: Page, handle: string) => product(page, handle).locator('.vnc-card__price');
    const scribble = (page: Page, handle: string) => price(page, handle).evaluate((element) => (element.textContent = 'untouched'));

    test('a size chosen on a card reprices that card and its dialog, and no other wine is redrawn', async ({ page }) => {
        await openWidget(page, { change: inTwoSizes });
        const card = product(page, 'californian-chardonnay');
        await expect(price(page, 'californian-chardonnay')).toHaveText('£10.99');
        await scribble(page, 'pinot-gris');
        await card.getByLabel('Size').selectOption('Magnum');
        await expect(price(page, 'californian-chardonnay')).toHaveText('£24.00');
        await expect(price(page, 'pinot-gris')).toHaveText('untouched');

        // The dialog is the same wine: it opens on the size chosen, and a change in it reaches the card.
        await card.locator('.vnc-card__media').click();
        const dialog = page.getByTestId('cc-dialog');
        await expect(dialog.getByLabel('Size')).toHaveValue('Magnum');
        await expect(dialog.locator('.vnc-card__price')).toHaveText('£24.00');
        await dialog.getByLabel('Size').selectOption('Bottle');
        await expect(dialog.locator('.vnc-card__price')).toHaveText('£10.99');
        await expect(price(page, 'californian-chardonnay')).toHaveText('£10.99');
        await expect(card.getByLabel('Size')).toHaveValue('Bottle');
        await expect(price(page, 'pinot-gris')).toHaveText('untouched');

        // A pick is everyone's business: every card is drawn again.
        await dialog.getByTestId('cc-pick').click();
        await expect(card).toHaveAttribute('data-cc-quantity', '1');
        await expect(price(page, 'pinot-gris')).toHaveText('£11.50');
    });

    test('a refusal is said on its own card, and no other wine is redrawn', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'californian-verdelho', 3);
        await scribble(page, 'pinot-gris');
        const card = product(page, 'californian-verdelho');
        await card.getByTestId('cc-pick').click({ force: true });
        await expect(card.locator('[role="status"]')).toContainText('all we have');
        await expect(price(page, 'pinot-gris')).toHaveText('untouched');
    });
});

test.describe('without the hooks', () => {
    test('the theme editor previews a draft bundle, and still refuses to sell it', async ({ page }) => {
        // `<KitenzoProvider>` turns preview on by itself in the editor; here the client is told.
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
        const ids = () => page.locator('[data-testid="cc-root"] [id]').evaluateAll((elements) => elements.map((element) => element.id));
        expect((await ids()).length).toBeGreaterThan(0);
        expect((await ids()).length).toBe(new Set(await ids()).size);

        // A section the theme injects later is mounted by a copy of the script of its own, which
        // has counted nothing: it must carry on from where the page's other widgets left off.
        await page.evaluate(() => {
            const first = document.querySelector('.shopify-section')!;
            const mount = first.querySelector('[id^="kitenzo-"]')!.cloneNode(false) as HTMLElement;
            mount.id = 'kitenzo-3';
            const script = document.createElement('script');
            script.src = first.querySelector('script')!.src;
            const section = document.createElement('div');
            section.className = 'shopify-section';
            section.append(mount, script);
            first.parentElement!.append(section);
        });
        await expect(page.locator('#kitenzo-3 [data-cc-product]').first()).toBeVisible();
        expect((await ids()).length).toBe(new Set(await ids()).size);
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
    test('ships no framework, at under half the React starter\'s weight', async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'one file, measured once');
        const js = readFileSync(resolve(ROOT, 'dist-embed/kitenzo-vanilla-core.js'));
        // React's element marker and its internals: present in any build that bundles React.
        expect(js.includes('react.element')).toBe(false);
        expect(js.includes('__SECRET_INTERNALS')).toBe(false);
        // The React starter is about 82 kB gzipped. A budget, so a stray dependency is noticed.
        expect(gzipSync(js, { level: 9 }).length).toBeLessThan(40 * 1024);
    });
});
