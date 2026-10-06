/*
 * What this example does beyond the conformance suite: the box is the interface.
 *
 * Box sizes from the bundle's `eq` rules, a tray that fills in pick order and empties the slot you
 * tap, a smaller box that asks before it drops anything, "Fill the rest" that routes around sold
 * out and low stock, a flavour that adds to a set price, and a buy button that waits for the box
 * the shopper chose. Driven through the test contract plus this widget's own hooks
 * (`data-mcb-size`, `data-mcb-slot`, `data-mcb-surcharge`, `mcb-tray`, `mcb-fill`,
 * `mcb-switch-dialog`), on the built asset, desktop and phone.
 */
import { expect, test, type Page } from '@playwright/test';

import { buyButton, chooseSize, openWidget, pick, product, requestsTo, tray, widget } from './harness';

const sizeCards = (page: Page) => page.locator('[data-mcb-size]');
const slotHandles = (page: Page) => tray(page).locator('[data-mcb-slot-product]').evaluateAll((slots) => slots.map((slot) => slot.getAttribute('data-mcb-slot-product')));
const status = (page: Page) => page.locator('.mcb-status').filter({ visible: true }).first();

test.describe('box sizes', () => {
    test('one card per eq rule, each with its price and its price per macaron', async ({ page }) => {
        await openWidget(page);
        await expect(sizeCards(page)).toHaveCount(3);
        await expect(sizeCards(page).nth(0)).toContainText('Box of 6');
        await expect(sizeCards(page).nth(0)).toContainText('£6.50');
        await expect(sizeCards(page).nth(0)).toContainText('£1.08 each');
        await expect(sizeCards(page).nth(2)).toContainText('£22.00');
        await expect(sizeCards(page).nth(2)).toContainText('£0.92 each');
        // Nothing preselected: the shopper chooses.
        await expect(page.locator('[data-mcb-size][aria-checked="true"]')).toHaveCount(0);
    });

    test('a bundle of 4 or 8 draws two cards, never three', async ({ page }) => {
        await openWidget(page, { bundleId: 2002 });
        await expect(sizeCards(page)).toHaveCount(2);
        await expect(sizeCards(page).nth(0)).toContainText('Box of 4');
        await expect(sizeCards(page).nth(1)).toContainText('Box of 8');
    });

    test('a bundle with no eq rules renders without a size chooser, its tray as big as the step allows', async ({ page }) => {
        await openWidget(page, { bundleId: 2003 });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(sizeCards(page)).toHaveCount(0);
        await expect(tray(page)).toHaveAttribute('data-slots', '12');
        await pick(page, 'vanilla-macaron', 6);
        // "Any 6 to 12": six is a sale.
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('a first pick with no box chosen chooses the smallest box', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'lemon-macaron');
        await expect(page.locator('[data-mcb-size="6"]')).toHaveAttribute('aria-checked', 'true');
        await expect(tray(page)).toHaveAttribute('data-slots', '6');
    });
});

test.describe('the tray', () => {
    test('fills in pick order, and tapping a slot empties that slot', async ({ page }) => {
        await openWidget(page);
        await chooseSize(page, 12);
        await expect(tray(page).locator('.mcb-slot--empty')).toHaveCount(12);
        await pick(page, 'raspberry-macaron');
        await pick(page, 'pistachio-macaron');
        await pick(page, 'raspberry-macaron');
        await pick(page, 'vanilla-macaron');
        expect(await slotHandles(page)).toEqual(['raspberry-macaron', 'pistachio-macaron', 'raspberry-macaron', 'vanilla-macaron']);

        // The first raspberry, not the newest one.
        await tray(page).locator('[data-mcb-slot="0"]').click();
        expect(await slotHandles(page)).toEqual(['pistachio-macaron', 'raspberry-macaron', 'vanilla-macaron']);
        await expect(product(page, 'raspberry-macaron')).toHaveAttribute('data-cc-quantity', '1');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(page.getByTestId('mcb-tray-count')).toHaveText('3 of 12');
    });

    test('a full box refuses one more and points at a bigger box; a bigger box just takes it', async ({ page }) => {
        await openWidget(page);
        await chooseSize(page, 6);
        await pick(page, 'vanilla-macaron', 6);
        const lemon = product(page, 'lemon-macaron');
        await lemon.getByTestId('cc-pick').click({ force: true });
        await expect(lemon).toHaveAttribute('data-cc-quantity', '0');
        await expect(lemon.locator('[role="status"]')).toContainText('box of 6 is full');

        await chooseSize(page, 12);
        await expect(page.getByTestId('mcb-switch-dialog')).toBeHidden();
        await pick(page, 'lemon-macaron');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '7');
    });

    test('the biggest box is the step\'s limit, and says "full" without offering a bigger box', async ({ page }) => {
        await openWidget(page);
        await chooseSize(page, 24);
        await page.getByTestId('mcb-fill').click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '24');
        const vanilla = product(page, 'vanilla-macaron');
        const before = await vanilla.getAttribute('data-cc-quantity');
        await vanilla.getByTestId('cc-pick').click({ force: true });
        await expect(vanilla).toHaveAttribute('data-cc-quantity', before!);
        await expect(vanilla.locator('[role="status"]')).toContainText('full');
        await expect(vanilla.locator('[role="status"]')).not.toContainText('bigger box');
    });
});

test.describe('switching to a smaller box', () => {
    async function nineInATwelve(page: Page) {
        await openWidget(page);
        await chooseSize(page, 12);
        for (const handle of ['vanilla-macaron', 'chocolate-macaron', 'pistachio-macaron', 'lemon-macaron', 'rose-macaron', 'english-toffee', 'raspberry-macaron', 'mango-orange-macaron', 'strawberry-chocolate-macaron']) {
            await pick(page, handle);
        }
    }

    test('asks first, and keeping the box changes nothing', async ({ page }) => {
        await nineInATwelve(page);
        await chooseSize(page, 6);
        const dialog = page.getByTestId('mcb-switch-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('holds 9 macarons');
        await expect(dialog).toContainText('takes out the last 3');
        await dialog.getByRole('button', { name: 'Keep my box of 12' }).click();
        await expect(dialog).toBeHidden();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '9');
        await expect(page.locator('[data-mcb-size="12"]')).toHaveAttribute('aria-checked', 'true');

        // Escape is "keep" too.
        await chooseSize(page, 6);
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '9');
    });

    test('confirming takes out the most recent picks and switches', async ({ page }) => {
        await nineInATwelve(page);
        await chooseSize(page, 6);
        await page.getByTestId('mcb-switch-confirm').click();
        await expect(page.locator('[data-mcb-size="6"]')).toHaveAttribute('aria-checked', 'true');
        expect(await slotHandles(page)).toEqual(['vanilla-macaron', 'chocolate-macaron', 'pistachio-macaron', 'lemon-macaron', 'rose-macaron', 'english-toffee']);
        await expect(product(page, 'raspberry-macaron')).toHaveAttribute('data-cc-quantity', '0');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
    });
});

test.describe('fill the rest', () => {
    test('fills only the empty slots, never with sold-out lavender or past rose\'s 4, and the box can be bought', async ({ page }) => {
        const { backend } = await openWidget(page);
        await chooseSize(page, 12);
        await pick(page, 'rose-macaron', 3);
        await pick(page, 'vanilla-macaron', 2);
        await page.getByTestId('mcb-fill').click();

        await expect(widget(page)).toHaveAttribute('data-qa-count', '12');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await expect(page.getByTestId('mcb-fill')).toHaveCount(0);
        expect((await slotHandles(page)).slice(0, 5)).toEqual(['rose-macaron', 'rose-macaron', 'rose-macaron', 'vanilla-macaron', 'vanilla-macaron']);
        await expect(product(page, 'lavender-macaron')).toHaveAttribute('data-cc-quantity', '0');
        expect(Number(await product(page, 'rose-macaron').getAttribute('data-cc-quantity'))).toBeLessThanOrEqual(4);

        await expect(page.getByTestId('cc-price').filter({ visible: true }).first()).toHaveAttribute('data-price-value', '12.00');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const configure = requestsTo(backend, /configure$/)[0]!.body as { products: unknown[] };
        expect(configure.products).toHaveLength(12);
    });
});

test.describe('the buy button', () => {
    test('waits for the box the shopper chose, even when the SDK would sell what is in it', async ({ page }) => {
        const { backend } = await openWidget(page);
        await chooseSize(page, 12);
        await pick(page, 'vanilla-macaron', 6);
        // Six is a valid box to the SDK, but this shopper is filling a box of 12.
        await expect(widget(page)).toHaveAttribute('data-complete', 'false');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(status(page)).toContainText('Add 6 more to fill your box of 12');
        await buyButton(page).click({ force: true });
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);
    });

    test('a full box costs what its card said', async ({ page }) => {
        await openWidget(page);
        await chooseSize(page, 24);
        await page.getByTestId('mcb-fill').click();
        const price = page.getByTestId('cc-price').filter({ visible: true }).first();
        await expect(price).toHaveAttribute('data-price-value', '22.00');
        await expect(page.getByTestId('cc-compare-at').filter({ visible: true }).first()).toHaveAttribute('data-price-value', '28.80');
    });

    test('in a market, the card and the total agree in the shopper\'s currency', async ({ page }) => {
        await openWidget(page, { scenarios: ['market-eur'] });
        const card = page.locator('[data-mcb-size="6"] .mcb-size__price > span');
        const cardPrice = await card.textContent();
        expect(cardPrice).toContain('€');
        await chooseSize(page, 6);
        await page.getByTestId('mcb-fill').click();
        await expect(page.getByTestId('cc-price').filter({ visible: true }).first()).toHaveText(cardPrice!);
    });
});

test.describe('a flavour that costs extra', () => {
    test('each size reads "From", the flavour says what it adds, and the total is the SDK\'s for what is in the box', async ({ page }) => {
        await openWidget(page, { bundleId: 2004 });
        await expect(sizeCards(page).nth(0)).toContainText('From £6.50');
        // A set price: no flavour shows a price of its own, and only pistachio adds to the box.
        await expect(page.locator('[data-cc-product] [data-price-value]')).toHaveCount(0);
        await expect(page.locator('[data-mcb-surcharge]')).toHaveCount(1);
        await expect(product(page, 'pistachio-macaron').locator('[data-mcb-surcharge]')).toHaveText('+£0.50');

        await chooseSize(page, 6);
        await expect(page.locator('.mcb-price--pending').filter({ visible: true }).first()).toContainText('From £6.50');
        await pick(page, 'pistachio-macaron', 2);
        await pick(page, 'vanilla-macaron', 4);
        await expect(page.getByTestId('cc-price').filter({ visible: true }).first()).toHaveAttribute('data-price-value', '7.50');
    });

    test('the merchant\'s wording, and nothing about money when prices are hidden', async ({ page }) => {
        await openWidget(page, { bundleId: 2004, content: { surchargeNote: '{amount} extra' } });
        await expect(product(page, 'pistachio-macaron').locator('[data-mcb-surcharge]')).toHaveText('£0.50 extra');
        await openWidget(page, { bundleId: 2004, content: { hidePrices: true } });
        await expect(product(page, 'pistachio-macaron')).toBeVisible();
        await expect(page.locator('[data-mcb-surcharge]')).toHaveCount(0);
    });

    test('a box sold at one price per size says nothing on its flavours', async ({ page }) => {
        await openWidget(page);
        await expect(sizeCards(page).nth(0)).not.toContainText('From');
        await expect(product(page, 'pistachio-macaron')).toBeVisible();
        await expect(page.locator('[data-cc-product] [data-price-value], [data-mcb-surcharge]')).toHaveCount(0);
    });
});

test.describe('layout', () => {
    test('the tray is in a sticky rail on desktop, and a strip in the sticky bar on a phone', async ({ page, isMobile }) => {
        await openWidget(page);
        await chooseSize(page, 12);
        await pick(page, 'vanilla-macaron', 2);
        const strip = page.locator('.mcb-strip');
        if (isMobile) {
            await expect(strip).toBeVisible();
            await expect(strip.locator('.mcb-strip__slot')).toHaveCount(12);
            await expect(strip.locator('.mcb-strip__slot--filled')).toHaveCount(2);
            await expect(page.getByTestId('cc-mobile-bar')).toBeVisible();
        } else {
            await expect(strip).toBeHidden();
            await expect(page.locator('.mcb-summary')).toHaveCSS('position', 'sticky');
            await page.mouse.wheel(0, 900);
            await expect(tray(page)).toBeInViewport();
        }
    });
});
