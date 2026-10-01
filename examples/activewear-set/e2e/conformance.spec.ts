/*
 * The conformance suite: what every Kitenzo custom component must do, checked on the built asset,
 * on a hostile theme, at desktop and on a phone.
 *
 * Each test drives the widget only through the public test contract (guides/the-contract.md):
 * `cc-*` test ids, `data-cc-product`, `data-cc-unavailable`, `data-cc-quantity`, and what the
 * mock backend records. Copy it into your own build and change only the helpers in harness.ts
 * (`completeSelection`, the handles) to fit your bundle.
 */
import { expect, test } from '@playwright/test';

import { createMockBackend } from '../dev/mock/backend';
import { loadFixtures } from '../dev/catalog';
import { addPiece, buyButton, choose, completeSelection, openWidget, optionValue, pick, product, requestsTo, widget } from './harness';

test.describe('loads', () => {
    test('renders every product of the bundle, and nothing that is not in it', async ({ page }) => {
        const { fixtures } = await openWidget(page);
        await expect(widget(page)).toBeVisible();
        const handles = await page.locator('[data-cc-product]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-cc-product')));
        const known = new Set(fixtures[0]!.products.map((entry) => entry.handle));
        expect(handles.length).toBeGreaterThan(0);
        for (const handle of handles) expect(known.has(handle!)).toBe(true);
    });

    test('shows its loading state inside the widget while the API is slow', async ({ page }) => {
        await openWidget(page, { scenarios: ['slow-api'] });
        await expect(page.getByTestId('cc-loading')).toBeVisible();
        await expect(page.locator('[data-cc-product]').first()).toBeVisible({ timeout: 10_000 });
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
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        // The set's copy names the steps still short rather than counting picks.
        await expect(page.locator('.aws-status').filter({ visible: true }).first()).toContainText('Still to choose: Top, Bra, Leggings');

        await buyButton(page).click({ force: true });
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);
    });

    test('a sold-out product is shown and unpickable, on its card and in its details dialog', async ({ page }) => {
        // No STRATA piece is sold out in every combination as configured (the set sells sold-out
        // combinations, not sold-out pieces), so this runs on the "everything sold out" scenario.
        await openWidget(page, { scenarios: ['all-sold-out'] });
        const card = page.locator('[data-cc-unavailable="true"]').first();
        await expect(card).toBeVisible();
        // A disabled control dispatches nothing, so asserting it is disabled IS the check; a forced
        // click on it would prove nothing either way.
        await expect(card.getByTestId('cc-pick')).toBeDisabled();
        await expect(card.getByTestId('cc-pick')).toHaveAccessibleName(/sold out/i);
        await card.locator('.aws-piece__media').click();
        await expect(page.getByTestId('cc-dialog').getByTestId('cc-pick')).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(card).toHaveAttribute('data-cc-quantity', '0');
    });

    // "Add to set" becomes "In your set" (with Remove) and back: this design's stepper.
    test('keyboard focus survives "Add to set" turning into "In your set" and back', async ({ page }) => {
        await openWidget(page);
        await choose(page, 'power-leggings', 'Size', 'M');
        await product(page, 'power-leggings').getByTestId('cc-pick').focus();
        await page.keyboard.press('Enter');
        await expect(product(page, 'power-leggings')).toHaveAttribute('data-cc-quantity', '1');
        await expect(product(page, 'power-leggings').getByTestId('cc-pick')).toBeFocused();
        await product(page, 'power-leggings').getByRole('button', { name: /^Remove/ }).focus();
        await page.keyboard.press('Enter');
        await expect(product(page, 'power-leggings')).toHaveAttribute('data-cc-quantity', '0');
        await expect(product(page, 'power-leggings').getByTestId('cc-pick')).toBeFocused();
    });

    test('a sold-out product disappears when the merchant hides sold-out products', async ({ page }) => {
        await openWidget(page, { scenarios: ['hide-sold-out'] });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(page.locator('[data-cc-unavailable="true"]')).toHaveCount(0);
    });

    test('an archived product is never offered', async ({ page }) => {
        const { fixtures } = await openWidget(page, { scenarios: ['archived-and-draft'] });
        const archived = fixtures[0]!.products.find((entry) => entry.status === 'ARCHIVED')!;
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(page.locator(`[data-cc-product="${archived.handle}"]`)).toHaveCount(0);
    });

    // A set takes one of each piece, so there is no stepper and a stock ceiling can only bind as
    // "sold out" or as the last few. The equivalent check: the last two say so, the piece goes in
    // once, and a second press is refused with the reason.
    test('the last of a combination says so, and the piece goes in once', async ({ page }) => {
        await openWidget(page);
        const card = product(page, 'power-leggings');
        await choose(page, 'power-leggings', 'Colour', 'Slate');
        await choose(page, 'power-leggings', 'Size', 'M');
        await expect(card.locator('[role="status"]')).toContainText('Only 2 left');
        await pick(page, 'power-leggings');
        await expect(card).toHaveAttribute('data-cc-quantity', '1');
        await card.getByTestId('cc-pick').click({ force: true });
        await expect(card).toHaveAttribute('data-cc-quantity', '1');
    });

    test('a full step refuses one more, and says so', async ({ page }) => {
        await openWidget(page);
        await addPiece(page, 'oversized-drop-tee', 'M');
        const card = product(page, 'oversized-drop-tee');
        await expect(card).toHaveAttribute('data-cc-quantity', '1');
        await card.getByTestId('cc-pick').click({ force: true });
        await expect(card).toHaveAttribute('data-cc-quantity', '1');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '1');
        await expect(card.locator('[role="status"]')).toContainText('in your set');
    });

    test('the details dialog opens in the top layer, inside the viewport, despite a transformed ancestor', async ({ page }) => {
        await openWidget(page);
        await product(page, 'power-leggings').locator('.aws-piece__media').click();
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
        // A top, a bra and leggings, all one bundle instance.
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

    test('a double press adds the set once', async ({ page }) => {
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
        // The add that is still pending is the one that was started: nothing may change it, so
        // even a colour change (which would swap a piece) is held.
        await expect(optionValue(page, 'power-leggings', 'Colour', 'Bone')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('[data-match="Bone"]')).toHaveAttribute('aria-disabled', 'true');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.item_count).toBe(3);
        expect(JSON.parse(backend.state.cart.attributes._bundles!)).toHaveProperty('9001');
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
        // Seeded at creation: the first paint already shows the saved set, in its saved sizes.
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(product(page, 'power-leggings')).toHaveAttribute('data-cc-quantity', '1');
        await expect(product(page, 'power-leggings').locator('[data-option="Size"][data-value="M"]')).toHaveAttribute('aria-pressed', 'true');
        // Change the leggings' colour: the piece in the set is swapped, not doubled.
        await choose(page, 'power-leggings', 'Colour', 'Bone');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const instances = new Set(backend.state.cart.items.map((item) => item.properties._bundle_data));
        expect(instances.size).toBe(1);
        expect(backend.state.cart.items.reduce((total, item) => total + item.quantity, 0)).toBe(3);
        expect(backend.state.cart.items.some((item) => item.variant_title === 'M / Bone' && item.product_title === 'Power Leggings')).toBe(true);
    });
});

test.describe('edit and history', () => {
    test('an Edit link whose saved set is gone does not promise a replacement', async ({ page }) => {
        const { backend } = await openWidget(page, { query: '?edit=4242&edit_uid=missing' });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(page.locator('.aws-notice')).toHaveCount(0);
        await completeSelection(page);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.item_count).toBe(3);
    });

    test('coming back from the cart through the back-forward cache shows a fresh builder', async ({ page }) => {
        await openWidget(page);
        await addPiece(page, 'power-leggings', 'M');
        await expect(product(page, 'power-leggings')).toHaveAttribute('data-cc-quantity', '1');
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await expect(product(page, 'power-leggings')).toHaveAttribute('data-cc-quantity', '0');
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
        await expect(page.locator('#kitenzo-2 [data-cc-product]').first()).toBeVisible();
        await page.waitForTimeout(300);
        expect(requestsTo(backend, /\/bundles\/\d+$/)).toHaveLength(2);
    });

    test('survives the theme editor re-rendering its section', async ({ page }) => {
        await openWidget(page, { scenarios: ['theme-editor'] });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await page.evaluate(() => {
            const section = document.querySelector('.shopify-section')!;
            section.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }));
            const fresh = section.cloneNode(true) as HTMLElement;
            fresh.querySelector('[data-activewear-set-bundle]')!.replaceChildren();
            section.replaceWith(fresh);
            fresh.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
        });
        await expect(page.getByTestId('cc-root')).toHaveCount(1);
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
    });

    test('hostile strings render as text: apostrophes intact, no markup, nothing executes', async ({ page }) => {
        await openWidget(page, {
            scenarios: ['hostile-strings'],
            content: { heading: `Maman's "Best" <b>Box</b>`, addToCart: `Add Maman's box` },
        });
        await expect(page.locator('.aws-header__title')).toHaveText(`Maman's "Best" <b>Box</b>`);
        await expect(buyButton(page)).toHaveText(`Add Maman's box`);
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        expect(await page.evaluate(() => document.body.dataset.pwned)).toBeUndefined();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    });

    // No stepper in this design. Its equivalent: the hostile theme's bare `button` rule (1em 25px
    // of padding, a 140px minimum width) must not blow the size buttons and swatches out of the
    // piece they sit in.
    test('bare theme button rules cannot push a size button or swatch out of its piece', async ({ page }) => {
        await openWidget(page);
        const card = product(page, 'form-sports-bra');
        const outer = (await card.boundingBox())!;
        for (const control of await card.locator('[data-option]').all()) {
            const box = (await control.boundingBox())!;
            expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
            expect(box.width).toBeLessThan(100);
            expect(box.height).toBeLessThanOrEqual(60);
        }
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
            head: '<style>#kitenzo-1 { --aws-accent: rgb(200, 0, 100); --aws-font-body: "Courier New", monospace; }</style>',
        });
        await completeSelection(page);
        await expect(buyButton(page)).toHaveCSS('background-color', 'rgb(200, 0, 100)');
        await expect(widget(page)).toHaveCSS('font-family', /Courier New/);
    });

    test('hidden prices are hidden everywhere', async ({ page }) => {
        await openWidget(page, { content: { hidePrices: true } });
        await completeSelection(page);
        await expect(page.getByTestId('cc-price')).toHaveCount(0);
        await expect(widget(page)).not.toContainText('£');
    });
});
