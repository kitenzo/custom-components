/*
 * What this example exists to show: shopper input that reaches the order intact.
 *
 * The order is what the merchant packs from, so every test here ends by reading the mock cart's
 * lines (what `/cart/add.js` received, properties and all), never the widget's own state. The
 * proof that matters most is the first: two gift boxes in one basket, each with its own engraving
 * and message, and each answer on its own box's lines.
 */
import { expect, test, type Page } from '@playwright/test';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type CartItem, type MockBackend } from '../dev/mock/backend';
import { buyButton, openWidget, pick, product, requestsTo, widget, write } from './harness';

const status = (page: Page) => page.locator('.gft-status').filter({ visible: true }).first();

/** Lines grouped by bundle instance (`_bundle_data`), in the order they were added. */
function boxes(backend: MockBackend): CartItem[][] {
    const groups = new Map<string, CartItem[]>();
    for (const item of backend.state.cart.items) {
        const key = item.properties._bundle_data ?? 'none';
        groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.values()];
}

/** The shopper's answers on one box's lines, as "Product: key=value", without the SDK's own properties. */
function answers(lines: CartItem[]): string[] {
    return lines
        .flatMap((line) => Object.entries(line.properties).filter(([key]) => !key.startsWith('_')).map(([key, value]) => `${line.product_title}: ${key}=${value}`))
        .sort();
}

async function addAndGoToCart(page: Page) {
    await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await buyButton(page).click();
    await page.waitForURL('**/cart');
}

test.describe('personalisation reaches the order', () => {
    test('two gift boxes in one cart: each engraving and message rides on its own box\'s lines', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });

        await openWidget(page, { backend });
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle');
        await pick(page, 'engravable-brass-matchbox');
        await pick(page, 'with-love-letterpress-card');
        await write(page, 'engravable-brass-matchbox', 'Lid engraving', 'R & J 2026');
        await write(page, 'with-love-letterpress-card', 'Your message', 'Happy anniversary, love R');
        await addAndGoToCart(page);

        // The same matchbox and the same card again, in a different box: only `_bundle_data` can
        // tell the two engravings apart, which is the point.
        await openWidget(page, { backend });
        await product(page, 'keepsake-gift-box').locator('[data-option-value="Grand"]').click();
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'loose-leaf-tea-tin');
        await pick(page, 'engravable-brass-matchbox');
        await pick(page, 'with-love-letterpress-card');
        await write(page, 'engravable-brass-matchbox', 'Lid engraving', 'MUM');
        await write(page, 'with-love-letterpress-card', 'Your message', 'Welcome home');
        await addAndGoToCart(page);

        const [first, second] = boxes(backend);
        expect(boxes(backend)).toHaveLength(2);
        expect(answers(first!)).toEqual(['Engravable Brass Matchbox: Engraving=R & J 2026', 'With Love Letterpress Card: Card message=Happy anniversary, love R']);
        expect(answers(second!)).toEqual(['Engravable Brass Matchbox: Engraving=MUM', 'With Love Letterpress Card: Card message=Welcome home']);
        expect(first!.map((line) => line.variant_title)).toContain('Petite / Oat');
        expect(second!.map((line) => line.variant_title)).toContain('Grand / Oat');
        // Named by the frozen key, never the label the merchant may reword.
        expect(JSON.stringify(backend.state.cart.items)).not.toMatch(/Lid engraving|Your message/);
        // Both boxes still discounted: `_bundles` was merged, not replaced.
        expect(Object.keys(JSON.parse(backend.state.cart.attributes._bundles!))).toHaveLength(2);
    });

    test('a missing engraving holds the buy button, says what is missing, and takes the shopper to it', async ({ page }) => {
        const { backend } = await openWidget(page);
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle');
        await pick(page, 'engravable-brass-matchbox');

        // The SDK is satisfied with the box; the engraving is what is missing.
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(status(page)).toHaveText('Add “Lid engraving” for the Engravable Brass Matchbox');

        // aria-disabled, not disabled: the press is delivered, and refused with an explanation.
        await buyButton(page).click({ force: true });
        const field = page.locator('[data-cc-personalise="engravable-brass-matchbox"]').getByLabel('Lid engraving', { exact: true });
        await expect(field).toBeFocused();
        await expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);

        // Over the limit is shown as it is typed, and never cut off silently.
        await field.fill('ABCDEFGHIJKLM');
        await expect(field).toHaveValue('ABCDEFGHIJKLM');
        await expect(status(page)).toHaveText('Shorten “Lid engraving” for the Engravable Brass Matchbox by 1');
        await expect(page.locator('[data-cc-personalise="engravable-brass-matchbox"]')).toContainText('1 over the limit');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');

        await field.fill('  R & J  ');
        await addAndGoToCart(page);
        const matchbox = backend.state.cart.items.find((item) => item.product_title === 'Engravable Brass Matchbox')!;
        expect(matchbox.properties.Engraving).toBe('R & J');
    });

    test('a blank optional message sends nothing, and a product taken out leaves its answer behind', async ({ page }) => {
        const { backend } = await openWidget(page);
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle');
        await pick(page, 'loose-leaf-tea-tin');
        await pick(page, 'engravable-brass-matchbox');
        await write(page, 'engravable-brass-matchbox', 'Lid engraving', 'GONE');
        await product(page, 'engravable-brass-matchbox').getByRole('button', { name: /^Remove/ }).click();
        await expect(page.locator('[data-cc-personalise="engravable-brass-matchbox"]')).toHaveCount(0);
        await pick(page, 'thank-you-letterpress-card');
        await addAndGoToCart(page);

        expect(backend.state.cart.items).toHaveLength(4);
        expect(answers(backend.state.cart.items)).toEqual([]);
    });

    test('every word and limit of a field comes from the bundle', async ({ page }) => {
        const fixtures = loadFixtures();
        const fixture = fixtures[0]!;
        const matchboxId = fixture.products.find((entry) => entry.handle === 'engravable-brass-matchbox')!.shopifyProductId;
        const [engraving] = fixture.bundle.personalisation![matchboxId]!;
        fixture.bundle.personalisation![matchboxId] = [{ ...engraving!, key: 'Monogram initials', label: 'Monogram', characterLimit: 3, helpText: 'Three letters, stamped.' }];
        const backend = createMockBackend({ fixtures });

        await openWidget(page, { backend });
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle');
        await pick(page, 'engravable-brass-matchbox');
        const panel = page.locator('[data-cc-personalise="engravable-brass-matchbox"]');
        await expect(panel).toContainText('Three letters, stamped.');
        await expect(panel).toContainText('3 left');
        await write(page, 'engravable-brass-matchbox', 'Monogram', 'ABCD');
        await expect(status(page)).toHaveText('Shorten “Monogram” for the Engravable Brass Matchbox by 1');
        await write(page, 'engravable-brass-matchbox', 'Monogram', 'ABC');
        await addAndGoToCart(page);
        expect(backend.state.cart.items.find((item) => item.product_title === 'Engravable Brass Matchbox')!.properties).toMatchObject({ 'Monogram initials': 'ABC' });
    });
});

test.describe('two sections on one page', () => {
    test('each widget\'s fields keep their own ids, so the buy button takes the shopper to its own engraving', async ({ page }) => {
        await openWidget(page, { sections: 2 });
        for (const index of [0, 1]) {
            const root = widget(page, index);
            for (const handle of ['keepsake-gift-box', 'hand-poured-soy-candle', 'engravable-brass-matchbox']) {
                await root.locator(`[data-cc-product="${handle}"]`).getByTestId('cc-pick').click();
            }
        }
        const duplicates = await page.evaluate(() => {
            const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
            return ids.filter((id, index) => ids.indexOf(id) !== index);
        });
        expect(duplicates).toEqual([]);

        await widget(page, 1).getByTestId('cc-add-to-cart').filter({ visible: true }).click({ force: true });
        await expect(widget(page, 1).locator('[data-cc-personalise="engravable-brass-matchbox"] input')).toBeFocused();
    });
});

test.describe('basket Edit', () => {
    test('restores the box, says plainly that the engraving must be typed again, and replaces the original', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });
        await openWidget(page, { backend });
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle');
        await pick(page, 'engravable-brass-matchbox');
        await write(page, 'engravable-brass-matchbox', 'Lid engraving', 'OLD');
        await addAndGoToCart(page);
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');

        await openWidget(page, { backend, query: `?edit=${configured}&edit_uid=${uid}` });
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(product(page, 'engravable-brass-matchbox')).toHaveAttribute('data-cc-quantity', '1');
        await expect(page.getByRole('status').filter({ hasText: 'type them again' })).toBeVisible();
        const field = page.locator('[data-cc-personalise="engravable-brass-matchbox"]').getByLabel('Lid engraving', { exact: true });
        await expect(field).toHaveValue('');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');

        await field.fill('NEW');
        await addAndGoToCart(page);
        expect(boxes(backend)).toHaveLength(1);
        expect(answers(backend.state.cart.items)).toEqual(['Engravable Brass Matchbox: Engraving=NEW']);
    });

    test('says nothing about retyping when nothing in the box was personalised', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });
        await openWidget(page, { backend });
        await pick(page, 'keepsake-gift-box');
        await pick(page, 'hand-poured-soy-candle', 2);
        await addAndGoToCart(page);
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');
        await openWidget(page, { backend, query: `?edit=${configured}&edit_uid=${uid}` });
        await expect(page.getByRole('status').filter({ hasText: 'editing a gift box' })).toBeVisible();
        await expect(page.getByText('type them again')).toHaveCount(0);
    });
});

test.describe('choosing', () => {
    test('a step that holds one swaps its choice instead of refusing', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'with-love-letterpress-card');
        await expect(product(page, 'new-home-letterpress-card').getByTestId('cc-pick')).toHaveText('Swap to this');
        await pick(page, 'new-home-letterpress-card');
        await expect(product(page, 'with-love-letterpress-card')).toHaveAttribute('data-cc-quantity', '0');
        await expect(product(page, 'new-home-letterpress-card')).toHaveAttribute('data-cc-quantity', '1');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '1');
    });

    test('the box\'s option grid knows which combinations exist, and a sold-out one says so', async ({ page }) => {
        await openWidget(page);
        const box = product(page, 'keepsake-gift-box');
        await pick(page, 'keepsake-gift-box');
        await box.locator('[data-option-value="Grand"]').click();
        // Grand / Terracotta is sold out: Terracotta is still shown, marked unreachable.
        await expect(box.locator('[data-option-value="Terracotta"]')).toHaveAttribute('data-reachable', 'false');
        await expect(box.getByTestId('cc-pick')).toHaveText('Swap to this');
        await pick(page, 'keepsake-gift-box');
        await expect(box).toHaveAttribute('data-cc-quantity', '1');
        await expect(page.locator('.gft-summary')).toContainText('Grand / Oat');

        await box.locator('[data-option-value="Terracotta"]').click();
        await expect(box.getByTestId('cc-pick')).toBeDisabled();
        await expect(box.getByTestId('cc-pick')).toHaveText('Sold out');
    });

    test('no photographs: every product is a drawn, named tile, and no image is requested', async ({ page }) => {
        const images: string[] = [];
        page.on('request', (request) => {
            if (request.resourceType() === 'image') images.push(request.url());
        });
        const { fixtures } = await openWidget(page);
        const count = fixtures[0]!.products.length;
        await expect(page.locator('[data-cc-product] .gft-card__media > .gft-art[role="img"]')).toHaveCount(count);
        await expect(widget(page).locator('img')).toHaveCount(0);
        await expect(product(page, 'hand-poured-soy-candle').getByRole('img', { name: 'Hand-Poured Soy Candle' })).toBeVisible();
        expect(images).toEqual([]);
    });
});
