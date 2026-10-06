/*
 * The conformance suite: what every Kitenzo custom component must do, checked on the built asset,
 * on a hostile theme, at desktop and on a phone.
 *
 * Each test drives the widget only through the public test contract (guides/the-contract.md):
 * `cc-*` test ids, `data-cc-product`, `data-cc-unavailable`, `data-cc-quantity`, and what the
 * mock backend records. Copy it into your own build and change only the helpers in harness.ts
 * (`completeSelection`, the handles) to fit your bundle.
 *
 * This widget opens on a quiz, so a test about the builder first skips it (`skipQuiz`) and lands
 * on an empty wizard, one step on screen. Where the starter's check assumed something this design
 * does not have (a stepper in a step that takes several, every step on one page), the test is
 * replaced by the equivalent check for this design, and says so.
 */
import { expect, test } from '@playwright/test';

import { createMockBackend, variantBundleId, type MockBackend } from '../dev/mock/backend';
import { loadFixtures } from '../dev/catalog';
import { buyButton, completeSelection, openStep, openWidget, pick, product, requestsTo, skipQuiz, widget } from './harness';

test.describe('loads', () => {
    test('renders every product of the bundle, and nothing that is not in it', async ({ page }) => {
        const { fixtures } = await openWidget(page);
        await expect(widget(page)).toBeVisible();
        await skipQuiz(page);
        const handles = await page.locator('[data-cc-product]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-cc-product')));
        const known = new Set(fixtures[0]!.products.map((entry) => entry.handle));
        expect(handles.length).toBeGreaterThan(0);
        for (const handle of handles) expect(known.has(handle!)).toBe(true);
    });

    test('shows its loading state inside the widget while the API is slow', async ({ page }) => {
        await openWidget(page, { scenarios: ['slow-api'] });
        await expect(page.getByTestId('cc-loading')).toBeVisible();
        // The first screen is the quiz, rendered only once the bundle (and its photographs) are in.
        await expect(page.getByTestId('cc-quiz')).toBeVisible({ timeout: 10_000 });
    });

    test('an unpublished bundle reads as unavailable, never as "please refresh"', async ({ page }) => {
        await openWidget(page, { scenarios: ['bundle-404'] });
        const error = page.getByTestId('cc-error');
        await expect(error).toContainText('not available');
        await expect(error).not.toContainText(/refresh|404/i);
    });

    test('an API failure is a sentence, with no status code or URL', async ({ page }) => {
        await openWidget(page, { scenarios: ['api-500'] });
        const error = page.getByTestId('cc-error');
        await expect(error).toContainText('refresh');
        await expect(error).not.toContainText(/500|http|api\//i);
    });

    test('a missing API key renders a sentence, not a blank page; the theme editor says how to fix it', async ({ page }) => {
        await openWidget(page, { attributes: { 'data-api-key': '' } });
        await expect(page.getByTestId('cc-error')).toBeVisible();
        await expect(page.getByTestId('cc-editor-panel')).toHaveCount(0);

        await openWidget(page, { attributes: { 'data-api-key': 'kit_missing' }, scenarios: ['theme-editor'] });
        await expect(page.getByTestId('cc-editor-panel')).toContainText('kit_live_');
    });
});

test.describe('selection', () => {
    test('nothing is preselected, and the buy button refuses until the bundle is complete, saying why', async ({ page }) => {
        const { backend } = await openWidget(page);
        await expect(widget(page)).toHaveAttribute('data-complete', 'false');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await skipQuiz(page);
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.skr-status').filter({ visible: true }).first()).toContainText('1 more to “Cleanse”');

        await buyButton(page).click({ force: true });
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);
    });

    test('a sold-out product is shown and unpickable, on its card and in its details dialog', async ({ page }) => {
        await openWidget(page);
        // The sold-out serum is in Treat: choosing a cleanser advances there (autoNextSection).
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        const card = page.locator('[data-cc-unavailable="true"]').first();
        await expect(card).toBeVisible();
        // A disabled control dispatches nothing, so asserting it is disabled IS the check; a forced
        // click on it would prove nothing either way.
        await expect(card.getByTestId('cc-pick')).toBeDisabled();
        await expect(card.getByTestId('cc-pick')).toHaveAccessibleName(/sold out/i);
        await card.locator('.skr-card__media').click();
        await expect(page.getByTestId('cc-dialog').getByTestId('cc-pick')).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(card).toHaveAttribute('data-cc-quantity', '0');
    });

    // The starter's "Add" becomes a stepper and back. Here a one-pick step's "Choose" becomes
    // "Chosen", and choosing another product swaps: focus must stay on the button that was pressed.
    // Moisturise, because it does not advance by itself (focus moving to the next step is right).
    test('keyboard focus survives "Choose" turning into "Chosen", and a swap', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        await pick(page, 'niacinamide-zinc-blemish-serum');
        await expect(page.locator('.skr-panel__title')).toHaveText('Moisturise');
        const gel = product(page, 'hyaluronic-aloe-gel-cream').getByTestId('cc-pick');
        await gel.focus();
        await page.keyboard.press('Enter');
        await expect(product(page, 'hyaluronic-aloe-gel-cream')).toHaveAttribute('data-cc-quantity', '1');
        await expect(gel).toBeFocused();
        const shea = product(page, 'squalane-shea-rich-cream').getByTestId('cc-pick');
        await shea.focus();
        await page.keyboard.press('Enter');
        await expect(product(page, 'squalane-shea-rich-cream')).toHaveAttribute('data-cc-quantity', '1');
        await expect(product(page, 'hyaluronic-aloe-gel-cream')).toHaveAttribute('data-cc-quantity', '0');
        await expect(shea).toBeFocused();
    });

    test('a sold-out product disappears when the merchant hides sold-out products', async ({ page }) => {
        await openWidget(page, { scenarios: ['hide-sold-out'] });
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        await expect(product(page, 'vitamin-c-ferulic-brightening-serum')).toBeVisible();
        await expect(page.locator('[data-cc-product="retinal-squalane-overnight-serum"]')).toHaveCount(0);
        await expect(page.locator('[data-cc-unavailable="true"]')).toHaveCount(0);
    });

    test('an archived product is never offered', async ({ page }) => {
        const { fixtures } = await openWidget(page, { scenarios: ['archived-and-draft'] });
        const archived = fixtures[0]!.products.find((entry) => entry.status === 'ARCHIVED')!;
        await skipQuiz(page);
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(page.locator(`[data-cc-product="${archived.handle}"]`)).toHaveCount(0);
    });

    // Replaces "the stepper stops at the stock ceiling": every step here takes one product, so no
    // stepper can reach a ceiling. The same stock rules show as a low-stock line, and as a sold-out
    // size that stays visible in the dropdown, disabled (reachableOptionValues).
    test('stock is visible where it bites: how many are left, and a sold-out size disabled, not hidden', async ({ page }) => {
        await openWidget(page, { scenarios: ['low-stock'] });
        await skipQuiz(page);
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm').locator('[role="status"]')).toContainText('Only 2 left');
        const oat = product(page, 'ceramide-oat-cream-cleanser');
        await expect(oat.locator('select')).toHaveValue('150ml');
        await expect(oat.locator('option[value="75ml"]')).toHaveJSProperty('disabled', true);
        await expect(oat).not.toHaveAttribute('data-cc-unavailable', 'true');
    });

    test('a product says how many are left from the merchant\'s threshold down, and never when it is 0', async ({ page }) => {
        // The oil balm has 2 left in this scenario.
        const hint = product(page, 'squalane-camellia-cleansing-oil-balm').locator('[role="status"]');
        await openWidget(page, { scenarios: ['low-stock'] });
        await skipQuiz(page);
        await expect(hint).toHaveText('Only 2 left');
        await openWidget(page, { scenarios: ['low-stock'], content: { lowStockAt: 1 } });
        await skipQuiz(page);
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm')).toBeVisible();
        await expect(hint).toHaveText('');
        await openWidget(page, { scenarios: ['low-stock'], content: { lowStockAt: 0 } });
        await skipQuiz(page);
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm')).toBeVisible();
        await expect(hint).toHaveText('');
    });

    // Replaces "a full step refuses one more": a step that takes exactly one product is a choice,
    // so choosing another swaps it in. The equivalent guarantee is that the step never holds more
    // than its rule allows, whatever the shopper presses.
    test('a one-pick step swaps rather than overfills: it never holds more than its rule allows', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        await openStep(page, 'Cleanse');
        await pick(page, 'pha-zinc-exfoliating-cleanser');
        await expect(product(page, 'pha-zinc-exfoliating-cleanser')).toHaveAttribute('data-cc-quantity', '1');
        await expect(product(page, 'amino-acid-gentle-gel-cleanser')).toHaveAttribute('data-cc-quantity', '0');
        await pick(page, 'pha-zinc-exfoliating-cleanser');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '1');
    });

    test('the details dialog opens in the top layer, inside the viewport, despite a transformed ancestor', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        await product(page, 'amino-acid-gentle-gel-cleanser').locator('.skr-card__media').click();
        const dialog = page.getByTestId('cc-dialog');
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        const viewport = page.viewportSize()!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });
});

test.describe('cart', () => {
    test('adds the bundle: configure, the lines, then _bundles, then the cart page', async ({ page }) => {
        const { backend, fixtures } = await openWidget(page);
        await completeSelection(page);
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
        await buyButton(page).click();
        await page.waitForURL('**/cart');

        const soldOutVariants = new Set(fixtures[0]!.products.flatMap((entry) => entry.variants.filter((variant) => !variant.available).map((variant) => variant.shopifyVariantId)));
        const configure = requestsTo(backend, /configure$/)[0]!.body as { products: { variant: string }[] };
        expect(configure.products.some((line) => soldOutVariants.has(line.variant))).toBe(false);

        const cart = backend.state.cart;
        // A cleanser, a serum and a moisturiser, all one bundle instance.
        expect(cart.items.reduce((total, item) => total + item.quantity, 0)).toBe(3);
        expect(new Set(cart.items.map((item) => item.properties._bundle_data)).size).toBe(1);
        expect(cart.items.every((item) => !soldOutVariants.has(String(item.variant_id)))).toBe(true);
        expect(JSON.parse(cart.attributes._bundles!)).toHaveProperty(String(requestsTo(backend, /configure$/).length && 9001));
    });

    test('merges _bundles with a bundle already in the cart, instead of replacing it', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });
        backend.state.cart.attributes._bundles = JSON.stringify({ 1234: { id: 1, configuredBundleId: 1234, items: [] } });
        await openWidget(page, { backend });
        await completeSelection(page);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(Object.keys(JSON.parse(backend.state.cart.attributes._bundles!))).toEqual(expect.arrayContaining(['1234', '9001']));
    });

    test('a refused add shows the store\'s own reason as a sentence, never the status or route', async ({ page }) => {
        await openWidget(page, { scenarios: ['cart-422'] });
        await completeSelection(page);
        await buyButton(page).click();
        const error = page.getByTestId('cc-cart-error').filter({ visible: true }).first();
        await expect(error).toContainText('You can only add 2');
        await expect(error).not.toContainText(/422|\/cart|http/);
        await expect(page).not.toHaveURL(/\/cart$/);
    });

    test('a double press adds the bundle once', async ({ page }) => {
        const { backend } = await openWidget(page);
        await completeSelection(page);
        await buyButton(page).dblclick();
        await page.waitForURL('**/cart');
        expect(requestsTo(backend, /configure$/)).toHaveLength(1);
        expect(new Set(backend.state.cart.items.map((item) => item.properties._bundle_data)).size).toBe(1);
    });

    test('an answer lost after the lines landed: the selection holds, and the retry adds nothing twice', async ({ page }) => {
        const { backend } = await openWidget(page, { scenarios: ['cart-lost-response'] });
        await completeSelection(page);
        await buyButton(page).click();
        await expect(page.getByTestId('cc-cart-error').filter({ visible: true }).first()).toContainText('again');
        expect(backend.state.cart.item_count).toBe(3);
        // The add that is still pending is the one that was started: nothing may change it.
        await expect(product(page, 'squalane-shea-rich-cream').getByTestId('cc-pick')).toHaveAttribute('aria-disabled', 'true');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.item_count).toBe(3);
        expect(JSON.parse(backend.state.cart.attributes._bundles!)).toHaveProperty('9001');
    });

    test('a failed add with no reason from the store shows the merchant\'s own sentence', async ({ page }) => {
        // A 500 carries only a status phrase, which is not a reason a shopper can read.
        await openWidget(page, { scenarios: ['cart-500'], content: { cartFailed: 'Our tills are down. Try again shortly.' } });
        await completeSelection(page);
        await buyButton(page).click();
        await expect(page.getByTestId('cc-cart-error').filter({ visible: true }).first()).toHaveText('Our tills are down. Try again shortly.');
    });

    test('a rate-limited add asks the shopper to wait', async ({ page }) => {
        await openWidget(page, { scenarios: ['cart-429'] });
        await completeSelection(page);
        await buyButton(page).click();
        await expect(page.getByTestId('cc-cart-error').filter({ visible: true }).first()).not.toContainText(/429/);
    });

    test('keeps a locale prefix on every cart route', async ({ page }) => {
        const { backend } = await openWidget(page, { rootUrl: '/en-gb' });
        await completeSelection(page);
        await buyButton(page).click();
        await page.waitForURL('**/en-gb/cart');
        const cartRoutes = backend.requests.filter((request) => /cart/.test(request.path)).map((request) => request.path);
        expect(cartRoutes.length).toBeGreaterThan(0);
        expect(cartRoutes.every((path) => path.startsWith('/en-gb/'))).toBe(true);
    });

    test('basket Edit restores the bundle and replaces it, leaving one bundle in the cart', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });
        await openWidget(page, { backend });
        await completeSelection(page);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');

        await openWidget(page, { backend, query: `?edit=${configured}&edit_uid=${uid}` });
        // Seeded at creation: the first paint already shows the saved routine, in the wizard, with
        // no quiz in front of it.
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(page.getByTestId('cc-quiz')).toHaveCount(0);
        await expect(product(page, 'amino-acid-gentle-gel-cleanser')).toHaveAttribute('data-cc-quantity', '1');
        await openStep(page, 'Moisturise');
        await pick(page, 'squalane-shea-rich-cream');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const instances = new Set(backend.state.cart.items.map((item) => item.properties._bundle_data));
        expect(instances.size).toBe(1);
        expect(backend.state.cart.items.reduce((total, item) => total + item.quantity, 0)).toBe(3);
        expect(backend.state.cart.items.some((item) => item.product_title.startsWith('Squalane + Shea'))).toBe(true);
    });
});

test.describe('edit and history', () => {
    test('an Edit link whose saved bundle is gone does not promise a replacement', async ({ page }) => {
        const { backend } = await openWidget(page, { query: '?edit=4242&edit_uid=missing' });
        // Nothing was restored, so there is nothing to adjust: the shopper starts at the quiz.
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
        await expect(page.locator('.skr-notice')).toHaveCount(0);
        await completeSelection(page);
        await expect(page.locator('.skr-notice')).toHaveCount(0);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.item_count).toBe(3);
    });

    test('coming back from the cart through the back-forward cache shows a fresh builder', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '1');
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await expect(page.getByTestId('cc-root')).toHaveCount(1);
    });

    test('shop settings that never load end in a sentence, not an endless spinner', async ({ page }) => {
        await openWidget(page, { scenarios: ['settings-error'] });
        await expect(page.getByTestId('cc-error')).toContainText('refresh', { timeout: 10_000 });
    });
});

test.describe('theme', () => {
    test('two sections on one page mount two widgets, each once', async ({ page }) => {
        // Each section includes the script, so the page runs two copies of it. A mount guard kept in
        // module state starts empty in the second copy and mounts the first section again: the DOM
        // looks the same, but every request goes out twice. Count the loads, not the elements.
        const { backend } = await openWidget(page, { sections: 2 });
        await expect(page.getByTestId('cc-root')).toHaveCount(2);
        await expect(page.locator('#kitenzo-1 [data-testid="cc-root"]')).toHaveCount(1);
        await expect(page.locator('#kitenzo-2 [data-testid="cc-root"]')).toHaveCount(1);
        await expect(page.locator('#kitenzo-2 [data-testid="cc-quiz"]')).toBeVisible();
        await page.waitForTimeout(300);
        expect(requestsTo(backend, /\/bundles\/\d+$/)).toHaveLength(2);
    });

    test('survives the theme editor re-rendering its section', async ({ page }) => {
        await openWidget(page, { scenarios: ['theme-editor'] });
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
        await page.evaluate(() => {
            const section = document.querySelector('.shopify-section')!;
            section.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }));
            const fresh = section.cloneNode(true) as HTMLElement;
            fresh.querySelector('[data-skincare-routine-bundle]')!.replaceChildren();
            section.replaceWith(fresh);
            fresh.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
        });
        await expect(page.getByTestId('cc-root')).toHaveCount(1);
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
    });

    test('hostile strings render as text: apostrophes intact, no markup, nothing executes', async ({ page }) => {
        await openWidget(page, {
            scenarios: ['hostile-strings'],
            content: {
                heading: `Maman's "Best" <b>Box</b>`,
                addToCart: `Add Maman's box`,
                questions: [{ title: `Maman's "skin" <b>type</b>?`, hint: '', answers: [{ label: `Maman's "dry" & <i>tight</i>`, tags: '' }] }],
            },
        });
        await page.getByTestId('cc-quiz-start').click();
        await expect(page.locator('.skr-display')).toHaveText(`Maman's "skin" <b>type</b>?`);
        await expect(page.locator('[data-cc-answer="q1a1"]')).toHaveText(`Maman's "dry" & <i>tight</i>`);
        await page.getByTestId('cc-quiz').getByRole('button', { name: 'Back' }).click();
        await skipQuiz(page);
        await expect(page.locator('.skr-header__title')).toHaveText(`Maman's "Best" <b>Box</b>`);
        await expect(buyButton(page)).toHaveText(`Add Maman's box`);
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        expect(await page.evaluate(() => document.body.dataset.pwned)).toBeUndefined();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });

    // Replaces the stepper check: this design's controls are a choice button, a Size dropdown and
    // step pills. Bare `button { padding: 1em 25px; min-width: 140px }` and `select { min-height:
    // 60px }` must not push any of them out of the card or the step bar.
    test('bare theme button and select rules cannot push a control out of its box', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        const card = product(page, 'ceramide-oat-cream-cleanser');
        const outer = (await card.boundingBox())!;
        for (const control of [card.getByTestId('cc-pick'), card.locator('select')]) {
            const inner = (await control.boundingBox())!;
            expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
            expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
            expect(inner.height).toBeLessThan(50);
        }
        const bar = (await page.locator('.skr-pills').boundingBox())!;
        const pill = (await page.locator('.skr-pill').first().boundingBox())!;
        expect(pill.height).toBeLessThanOrEqual(bar.height);
    });

    test('a zero-decimal market shows the shopper\'s currency, and no £ anywhere', async ({ page }) => {
        await openWidget(page, { scenarios: ['market-jpy'] });
        await completeSelection(page);
        const price = page.getByTestId('cc-price').filter({ visible: true }).first();
        await expect(price).toContainText('¥');
        await expect(price).not.toContainText('.');
        await expect(widget(page)).not.toContainText('£');
    });

    test('the merchant\'s colours and the theme\'s fonts, set by the section on the mount element, reach the widget', async ({ page }) => {
        await openWidget(page, {
            head: '<style>#kitenzo-1 { --skr-accent: rgb(200, 0, 100); --skr-font-body: "Courier New", monospace; --skr-sticky-top: 40px; }</style>',
        });
        await completeSelection(page);
        await expect(buyButton(page)).toHaveCSS('background-color', 'rgb(200, 0, 100)');
        await expect(widget(page)).toHaveCSS('font-family', /Courier New/);
        // This design's step bar sits below a sticky theme header of the height the merchant set.
        await expect(page.locator('.skr-pills')).toHaveCSS('top', '52px');
    });

    test('hidden prices are hidden everywhere', async ({ page }) => {
        await openWidget(page, { content: { hidePrices: true } });
        await completeSelection(page);
        await expect(page.getByTestId('cc-price')).toHaveCount(0);
        await expect(widget(page)).not.toContainText('£');
    });
});

// A React widget gets all of this from `useBundle` and the cart hook; one that fetched the bundle
// or built its cart lines some other way would quietly drop out of the merchant's tests.
test.describe('an A/B test', () => {
    const impressions = (backend: MockBackend) => requestsTo(backend, /\/ab-tests\/impression$/).map((request) => request.body);

    test('a shopper in the test is counted once, and their cart lines are credited to the variant they saw', async ({ page }) => {
        const { backend, fixtures } = await openWidget(page, { scenarios: ['ab-stays'] });
        await completeSelection(page);
        const visitorId = requestsTo(backend, /\/bundles\/\d+$/)[0]!.query.visitor_id;
        expect(visitorId).toBeTruthy();
        await expect.poll(() => impressions(backend)).toEqual([{ bundleId: fixtures[0]!.bundle.id, visitorId }]);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.items.length).toBeGreaterThan(0);
        expect(backend.state.cart.items.every((item) => item.properties._ab_test_routed === 'true')).toBe(true);
        expect(impressions(backend)).toHaveLength(1);
    });

    test('a shopper assigned the other variant is sent to its page with the page\'s query, and counted there, not here', async ({ page }) => {
        const { backend, fixtures } = await openWidget(page, { scenarios: ['ab-other-variant'], query: '?utm_source=email' });
        const entry = fixtures[0]!.bundle.id;
        const variant = variantBundleId(entry);
        await page.waitForURL((url) => url.pathname === '/pages/variant-b');
        expect(new URL(page.url()).search).toBe(`?bundle=${variant}&utm_source=email`);
        // The variant's page is told who the shopper is and which test sent them, and counts them.
        await expect.poll(() => requestsTo(backend, /\/bundles\/\d+$/).map((request) => request.path.split('/').pop())).toEqual([String(entry), String(variant)]);
        const [first, second] = requestsTo(backend, /\/bundles\/\d+$/);
        expect(first!.query.visitor_id).toBeTruthy();
        expect(second!.query).toMatchObject({ visitor_id: first!.query.visitor_id, ab_routed: '5' });
        await expect.poll(() => impressions(backend)).toEqual([{ bundleId: variant, visitorId: first!.query.visitor_id }]);
    });
});
