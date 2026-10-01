/*
 * What this example adds to the conformance suite: a ladder read off the bundle's tiers, a widget
 * that fits the column it is given (container queries, not viewport breakpoints), and every
 * amount on it, ladder rows included, in the shopper's currency.
 */
import { expect, test, type Page } from '@playwright/test';

import type { Fixture } from '../dev/mock/wire';
import { buyButton, LAYOUTS, openWidget, pick, product, widget } from './harness';

const rungs = (page: Page) => widget(page).locator('[data-vol-rung]');
const progress = (page: Page) => page.getByTestId('vol-progress');

const withTiers = (tiers: { atLeast: number; discount: number }[]) => (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: {
        ...fixture.bundle,
        discount: {
            ...fixture.bundle.discount!,
            tiers: tiers.map((tier) => ({ type: 'total_products', operation: 'gte', value: tier.atLeast.toFixed(2), discount: tier.discount.toFixed(2), customText: null })),
        },
    },
});

test.describe('the ladder', () => {
    test('has one row per tier of the bundle, in order, with what each saves and costs', async ({ page }) => {
        await openWidget(page);
        await expect(rungs(page)).toHaveCount(4);
        expect(await rungs(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-vol-rung')))).toEqual(['2', '3', '4', '6']);
        await expect(rungs(page).nth(0)).toContainText('2 pouches');
        await expect(rungs(page).nth(0)).toContainText('Save 10%');
        // £9.99 less 10%, as the engine prices two pouches.
        await expect(rungs(page).nth(0)).toContainText('£8.99 each');
        await expect(rungs(page).nth(3)).toContainText('Save 25%');
        await expect(rungs(page).nth(3)).toContainText('Best value');
    });

    test('is the merchant\'s tiers, not the widget\'s: change them and the rows change', async ({ page }) => {
        await openWidget(page, {
            transform: withTiers([
                { atLeast: 3, discount: 12 },
                { atLeast: 5, discount: 30 },
            ]),
        });
        expect(await rungs(page).evaluateAll((rows) => rows.map((row) => row.textContent))).toEqual([
            expect.stringContaining('3 pouches'),
            expect.stringContaining('5 pouches'),
        ]);
        await expect(rungs(page).nth(1)).toContainText('Save 30%');
        await expect(widget(page)).not.toContainText('Save 10%');
    });

    test('climbs as the shopper adds: the tier in force is highlighted, and the next one named', async ({ page }) => {
        await openWidget(page);
        await expect(progress(page)).toHaveText('Choose 2 to save 10%');
        await expect(widget(page).locator('[aria-current="step"]')).toHaveCount(0);

        await pick(page, 'chocolate-whey-protein', 2);
        await expect(widget(page).locator('[aria-current="step"]')).toHaveAttribute('data-vol-rung', '2');
        await expect(progress(page)).toHaveText('Add 1 more to save 15%');

        await pick(page, 'vanilla-whey-protein', 2);
        await expect(widget(page).locator('[aria-current="step"]')).toHaveAttribute('data-vol-rung', '4');
        // There is no tier at 5: the next one is two away, not one.
        await expect(progress(page)).toHaveText('Add 2 more to save 25%');

        await pick(page, 'peanut-butter-whey-protein', 2);
        await expect(widget(page).locator('[aria-current="step"]')).toHaveAttribute('data-vol-rung', '6');
        await expect(progress(page)).toHaveText('Best price unlocked: you save 25%');
    });

    test('the total agrees with the tier in force', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'chocolate-whey-protein', 2);
        await pick(page, 'vanilla-whey-protein', 2);
        const total = Number(await page.getByTestId('cc-price').getAttribute('data-price-value'));
        const original = Number(await page.getByTestId('cc-compare-at').getAttribute('data-price-value'));
        expect(original).toBeCloseTo(4 * 9.99, 2);
        expect(1 - total / original).toBeCloseTo(0.2, 2);
    });

    test('a bundle whose discount is not tiered hides the ladder, still sells, and tells the merchant why', async ({ page }) => {
        await openWidget(page, {
            scenarios: ['theme-editor'],
            transform: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'percentage', value: '10.00' } } }),
        });
        await expect(page.locator('[data-cc-product]').first()).toBeVisible();
        await expect(rungs(page)).toHaveCount(0);
        await expect(page.getByTestId('cc-editor-panel')).toContainText('ladder is hidden');
        await pick(page, 'chocolate-whey-protein', 2);
        await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('the root-scoped reset does not outrank a component\'s own spacing', async ({ page }) => {
        // The reset zeroes paragraph margins under the root. Written as `.vol-root p` it outranked
        // `.vol-header__intro { margin-top }`; inside `:where()` it no longer does.
        await openWidget(page);
        await expect(widget(page).locator('.vol-header__intro')).toHaveCSS('margin-top', '8px');
    });

    test('the merchant\'s colour settings reach the widget', async ({ page }) => {
        // The Liquid sets them on the mount element. Defaults declared on the widget's own root
        // would override what it inherits and quietly ignore every colour setting.
        await openWidget(page, { attributes: { style: '--vol-accent: rgb(200, 30, 60); --vol-highlight: rgb(10, 120, 250)' } });
        await expect(buyButton(page)).toHaveCSS('background-color', 'rgb(200, 30, 60)');
        await pick(page, 'chocolate-whey-protein', 2);
        await expect(widget(page).locator('[aria-current="step"] .vol-rung__save')).toHaveCSS('background-color', 'rgb(10, 120, 250)');
    });
});

test.describe('fits the column it is given', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Geometry at 1440 desktop; the phone runs the conformance suite.');
    });

    test('at 1440, the ladder stays inside the product page\'s column, with no horizontal overflow', async ({ page }) => {
        await openWidget(page, { layout: 'ladder' });
        await pick(page, 'chocolate-whey-protein', 2);
        await pick(page, 'peanut-butter-whey-protein', 3);
        await product(page, 'peanut-butter-whey-protein').getByTestId('cc-pick').click({ force: true }); // the stock message, at its longest
        const geometry = await page.evaluate(() => {
            const column = document.querySelector('.vol-pdp__info')!.getBoundingClientRect();
            const root = document.querySelector<HTMLElement>('[data-testid="cc-root"]')!;
            const box = root.getBoundingClientRect();
            // What the shopper can see of an element: its box, cut by every ancestor that clips
            // (a thumbnail zoomed inside its rounded frame is not overflow).
            const visible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                let left = rect.left;
                let right = rect.right;
                for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
                    if (getComputedStyle(parent).overflowX !== 'visible') {
                        const clip = parent.getBoundingClientRect();
                        left = Math.max(left, clip.left);
                        right = Math.min(right, clip.right);
                    }
                }
                return { left, right, width: right - left };
            };
            const outside = [...root.querySelectorAll('*')]
                .filter((element) => element.closest('dialog') === null)
                .filter((element) => {
                    const rect = visible(element);
                    return rect.width > 0 && (rect.left < column.left - 0.5 || rect.right > column.right + 0.5);
                })
                .map((element) => `${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}`);
            return {
                columnWidth: column.width,
                root: { left: box.left, right: box.right },
                column: { left: column.left, right: column.right },
                rootOverflow: root.scrollWidth - root.clientWidth,
                pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
                outside,
            };
        });
        // The column is the width the ladder is designed for, beside the photos.
        expect(geometry.columnWidth).toBeGreaterThanOrEqual(320);
        expect(geometry.columnWidth).toBeLessThanOrEqual(480);
        expect(geometry.root.left).toBeGreaterThanOrEqual(geometry.column.left - 0.5);
        expect(geometry.root.right).toBeLessThanOrEqual(geometry.column.right + 0.5);
        expect(geometry.rootOverflow).toBeLessThanOrEqual(0);
        expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
        expect(geometry.outside).toEqual([]);
    });

    test('the layout follows the container, not the viewport: same 1440 window, three widths, three arrangements', async ({ page }) => {
        const rungTops = () => rungs(page).evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().top)));

        // In the column: rungs stacked, one per row.
        await openWidget(page, { layout: 'ladder' });
        const column = await rungTops();
        expect(new Set(column).size).toBe(4);

        // The same ladder handed a 900px container: the products move beside the ladder.
        await page.evaluate(() => {
            const info = document.querySelector<HTMLElement>('.vol-pdp')!;
            info.style.display = 'block';
            document.querySelector<HTMLElement>('.vol-pdp__media')!.style.display = 'none';
            document.querySelector<HTMLElement>('.vol-pdp__info')!.style.width = '900px';
        });
        const ladderBox = (await widget(page).locator('.vol-ladder').boundingBox())!;
        const productsBox = (await widget(page).locator('.vol-products').boundingBox())!;
        expect(productsBox.x).toBeGreaterThan(ladderBox.x + ladderBox.width - 1);

        // The grid layout in a full-width section: the rungs side by side.
        await openWidget(page, { layout: 'grid' });
        expect(new Set(await rungTops()).size).toBe(1);
    });
});

for (const layout of LAYOUTS) {
    test.describe(`markets (${layout} layout)`, () => {
        // The market's own figures, not the shop's with a new symbol: £9.99 is €11.69 and ¥1,898
        // here, and two pouches at 10% off are €10.52 and ¥1,708 each.
        for (const { scenario, symbol, decimals, unit, rung } of [
            { scenario: 'market-eur', symbol: '€', decimals: true, unit: '€11.69', rung: '€10.52' },
            { scenario: 'market-jpy', symbol: '¥', decimals: false, unit: '¥1,898', rung: '¥1,708' },
        ]) {
            test(`under ?scenario=${scenario}, every amount is in the shopper's currency: unit prices, ladder rows, total, saving`, async ({ page }) => {
                await openWidget(page, { layout, scenarios: [scenario] });
                await pick(page, 'chocolate-whey-protein', 2);
                await pick(page, 'vanilla-whey-protein', 1);

                // Every kind of amount is on screen, so "all of them" is not vacuously true.
                await expect(widget(page).locator('[data-cc-product] [data-vol-amount]')).toHaveCount(4);
                await expect(rungs(page).locator('[data-vol-amount]')).toHaveCount(4);
                await expect(page.getByTestId('cc-price')).toBeVisible();
                await expect(page.getByTestId('cc-compare-at')).toBeVisible();
                await expect(page.getByTestId('cc-saving')).toBeVisible();

                const amounts = await widget(page).locator('[data-vol-amount]').allTextContents();
                expect(amounts.length).toBeGreaterThanOrEqual(11);
                for (const amount of amounts) {
                    expect(amount, amount).toContain(symbol);
                    expect(amount, amount).not.toContain('£');
                    if (!decimals) expect(amount, amount).not.toMatch(/\d\.\d/);
                }
                await expect(widget(page)).not.toContainText('£');
                await expect(product(page, 'chocolate-whey-protein').locator('[data-vol-amount]')).toHaveText(unit);
                await expect(rungs(page).nth(0).locator('[data-vol-amount]')).toContainText(rung);
            });
        }
    });
}
