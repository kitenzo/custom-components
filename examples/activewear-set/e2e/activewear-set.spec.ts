/*
 * What this example adds to the conformance suite: a set price shown before the first pick, a
 * surcharge that moves it (and says why, in the shopper's currency), an option grid that follows
 * the significance rule and explains every value it withholds, "Match colours", and photographs
 * that follow the chosen colour. Same harness, same built asset, same hostile theme.
 */
import { expect, test, type Page } from '@playwright/test';

import { addPiece, choose, openWidget, optionValue, pick, product, widget } from './harness';

const price = (page: Page) => page.getByTestId('cc-price').filter({ visible: true }).first();
const status = (page: Page, handle: string) => product(page, handle).locator('.aws-piece__message');
const pressed = (page: Page, handle: string, option: string) => product(page, handle).locator(`[data-option="${option}"][aria-pressed="true"]`);

test.describe('the set price', () => {
    test('is known before anything is picked, and shows from the first paint', async ({ page }) => {
        await openWidget(page);
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await expect(price(page)).toHaveAttribute('data-price-value', '120.00');
        await expect(page.locator('.aws-header__price')).toContainText('£120.00');
    });

    test('moves when Slate is chosen, and the widget says why', async ({ page }) => {
        await openWidget(page);
        await choose(page, 'power-leggings', 'Colour', 'Slate');
        await expect(product(page, 'power-leggings').getByTestId('aws-surcharge-note')).toHaveText('Slate adds £5.00');
        await addPiece(page, 'power-leggings', 'L');
        await expect(price(page)).toHaveAttribute('data-price-value', '125.00');
        await expect(page.getByTestId('aws-surcharge-line').filter({ visible: true }).first()).toContainText(/Leggings in Slate\s*\+£5\.00/);

        // Swapping the piece out of Slate takes the surcharge with it.
        await choose(page, 'power-leggings', 'Colour', 'Moss');
        await expect(price(page)).toHaveAttribute('data-price-value', '120.00');
        await expect(page.getByTestId('aws-surcharge-line')).toHaveCount(0);
    });

    test('prices the set and the surcharge in the shopper\'s currency, at the same rate', async ({ page }) => {
        await openWidget(page, { scenarios: ['market-eur'] });
        await expect(price(page)).toHaveAttribute('data-price-value', '140.40');
        await choose(page, 'power-leggings', 'Colour', 'Slate');
        await expect(product(page, 'power-leggings').getByTestId('aws-surcharge-note')).toHaveText('Slate adds €5.85');
        await addPiece(page, 'power-leggings', 'L');
        await expect(price(page)).toHaveAttribute('data-price-value', '146.25');
        await expect(widget(page)).not.toContainText('£');
    });
});

test.describe('the option grid', () => {
    test('changing the colour never moves a size the shopper chose, on the card or in the set', async ({ page }) => {
        await openWidget(page);
        for (const handle of ['oversized-drop-tee', 'form-sports-bra', 'power-leggings']) {
            await choose(page, handle, 'Size', 'M');
            for (const colour of ['Bone', 'Moss', 'Slate', 'Onyx']) {
                await choose(page, handle, 'Colour', colour);
                await expect(pressed(page, handle, 'Colour')).toHaveAttribute('data-value', colour);
                await expect(pressed(page, handle, 'Size')).toHaveAttribute('data-value', 'M');
            }
        }
        // In the set, a colour change is a swap: the size the shopper chose goes with it.
        await pick(page, 'power-leggings');
        await choose(page, 'power-leggings', 'Colour', 'Bone');
        await expect(pressed(page, 'power-leggings', 'Size')).toHaveAttribute('data-value', 'M');
        await expect(page.locator('.aws-summary .aws-line__variant')).toContainText(['M / Bone']);
    });

    test('a colour sold out in the chosen size is disabled, not hidden, says why, and pressing it changes nothing', async ({ page }) => {
        await openWidget(page);
        await choose(page, 'power-leggings', 'Size', 'XS');
        const moss = optionValue(page, 'power-leggings', 'Colour', 'Moss');
        await expect(moss).toBeVisible();
        await expect(moss).toHaveAttribute('aria-disabled', 'true');
        await expect(product(page, 'power-leggings').locator('.aws-option__note')).toContainText('Moss is sold out in XS.');
        await moss.click({ force: true });
        await expect(pressed(page, 'power-leggings', 'Colour')).toHaveAttribute('data-value', 'Onyx');
        await expect(pressed(page, 'power-leggings', 'Size')).toHaveAttribute('data-value', 'XS');
        await expect(status(page, 'power-leggings')).toHaveText('Moss is sold out in XS.');
    });

    test('a size sold out in every colour stays on the row, disabled, with the reason', async ({ page }) => {
        await openWidget(page);
        const xl = optionValue(page, 'form-sports-bra', 'Size', 'XL');
        await expect(xl).toBeVisible();
        await expect(xl).toHaveAttribute('aria-disabled', 'true');
        await expect(product(page, 'form-sports-bra').locator('.aws-option__note')).toContainText('XL is sold out.');
    });

    test('a size change that rules out the colour moves the colour, and says so', async ({ page }) => {
        await openWidget(page);
        await choose(page, 'power-leggings', 'Colour', 'Moss');
        await choose(page, 'power-leggings', 'Size', 'XS');
        await expect(pressed(page, 'power-leggings', 'Colour')).toHaveAttribute('data-value', 'Onyx');
        await expect(status(page, 'power-leggings')).toHaveText('Moss is sold out in XS, so Colour is now Onyx.');
    });

    test('nothing is added until a size is chosen, and the piece says so', async ({ page }) => {
        const { backend } = await openWidget(page);
        await pick(page, 'oversized-drop-tee');
        await expect(product(page, 'oversized-drop-tee')).toHaveAttribute('data-cc-quantity', '0');
        await expect(status(page, 'oversized-drop-tee')).toHaveText('Choose your size first.');
        expect(backend.requests.filter((request) => /configure|cart/.test(request.path))).toHaveLength(0);
    });

    test('the photograph follows the chosen colour', async ({ page }) => {
        const { fixtures } = await openWidget(page);
        const tee = fixtures[0]!.products.find((entry) => entry.handle === 'oversized-drop-tee')!;
        const mossImage = tee.variants.find((variant) => variant.title === 'M / Moss')!.image!.split('?')[0]!;
        const image = product(page, 'oversized-drop-tee').locator('.aws-piece__media img');
        await expect(image).not.toHaveAttribute('src', new RegExp(mossImage.split('/').pop()!));
        await choose(page, 'oversized-drop-tee', 'Colour', 'Moss');
        await expect(image).toHaveAttribute('src', new RegExp(mossImage.split('/').pop()!));
    });
});

test.describe('match colours', () => {
    test('puts every piece in one colour where it can, and names the piece where it cannot', async ({ page }) => {
        await openWidget(page);
        await addPiece(page, 'oversized-drop-tee', 'M');
        await addPiece(page, 'power-leggings', 'XS');
        await page.locator('[data-match="Moss"]').click();

        await expect(pressed(page, 'oversized-drop-tee', 'Colour')).toHaveAttribute('data-value', 'Moss');
        await expect(pressed(page, 'form-sports-bra', 'Colour')).toHaveAttribute('data-value', 'Moss');
        // The leggings keep the shopper's XS, and so stay Onyx: matching never moves a size.
        await expect(pressed(page, 'power-leggings', 'Colour')).toHaveAttribute('data-value', 'Onyx');
        await expect(pressed(page, 'power-leggings', 'Size')).toHaveAttribute('data-value', 'XS');
        const result = page.getByTestId('aws-match-result');
        await expect(result).toContainText('Not available in Moss');
        await expect(result).toContainText(/Leggings\s*Moss is sold out in XS\./);

        // The top was already in the set: it is swapped, not doubled.
        await expect(widget(page)).toHaveAttribute('data-qa-count', '2');
        await expect(page.locator('.aws-summary .aws-line__variant')).toContainText(['M / Moss', 'XS / Onyx']);
    });

    test('says so when every piece matched', async ({ page }) => {
        await openWidget(page);
        await page.locator('[data-match="Bone"]').click();
        await expect(page.getByTestId('aws-match-result')).toHaveText('Every piece is now Bone.');
        await expect(page.locator('[data-match="Bone"]')).toHaveAttribute('aria-pressed', 'true');
    });
});
