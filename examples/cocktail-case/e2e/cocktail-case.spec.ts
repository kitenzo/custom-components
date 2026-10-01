/*
 * What this example adds to the conformance suite: tag filters, the discount ladder, "Surprise
 * me", and subscribe and save through Kitenzo Recurring bundles (a new plan, a reorder link, and
 * an expired one). Same harness, same built asset, same hostile theme, desktop and mobile.
 */
import { expect, test, type Page } from '@playwright/test';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend } from '../dev/mock/backend';
import { DEMO_SUBSCRIPTION, serveReorderLinks } from '../dev/reorder';
import { buyButton, completeSelection, openWidget, pick, product, requestsTo, widget } from './harness';

const cards = (page: Page) => page.locator('[data-cc-product]');
const chip = (page: Page, prefix: string, key: string) => page.locator(`[data-ckc-facet="${prefix}${key}"]`);
const ladder = (page: Page) => page.getByTestId('ckc-ladder-message');
const surprise = (page: Page) => page.getByTestId('ckc-surprise');
const status = (page: Page) => page.locator('.ckc-status').filter({ visible: true }).first();
const priceValue = async (page: Page) => Number(await page.getByTestId('cc-price').filter({ visible: true }).first().getAttribute('data-price-value'));

async function handlesShown(page: Page) {
    return (await cards(page).evaluateAll((list) => list.map((card) => card.getAttribute('data-cc-product')))).sort();
}

test.describe('filters', () => {
    test('chips come from prefixed tags only, with counts, in the theme\'s facet names', async ({ page }) => {
        await openWidget(page);
        const facets = page.getByTestId('ckc-facets');
        await expect(facets.getByRole('group', { name: 'Flavour' })).toBeVisible();
        await expect(facets.getByRole('group', { name: 'Strength' })).toBeVisible();
        await expect(chip(page, 'Flavor_', 'fruity')).toContainText('5');
        await expect(chip(page, 'Strength_', 'stronger')).toContainText('6');
        // "Fruity", "Light" (no prefix) are on the same products; they make no chips of their own.
        await expect(facets.getByRole('button')).toHaveCount(6);
    });

    test('OR within a facet, AND across facets, and counts that follow the other facets', async ({ page }) => {
        await openWidget(page);
        await chip(page, 'Flavor_', 'citrus').click();
        await expect(chip(page, 'Flavor_', 'citrus')).toHaveAttribute('aria-pressed', 'true');
        expect(await handlesShown(page)).toEqual(['blood-orange-bitters', 'cucumber-lime-tonic', 'grapefruit-rosemary', 'yuzu-elderflower']);
        await expect(chip(page, 'Strength_', 'light')).toContainText('2');

        await chip(page, 'Flavor_', 'fruity').click();
        await expect(cards(page)).toHaveCount(9);

        await chip(page, 'Flavor_', 'citrus').click();
        await chip(page, 'Strength_', 'light').click();
        expect(await handlesShown(page)).toEqual(['raspberry-hibiscus', 'watermelon-basil']);
    });

    test('a can in the case is never filtered away: it stays, marked, and can still be taken out', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'pear-cardamom', 2);
        await chip(page, 'Strength_', 'light').click();
        const pear = product(page, 'pear-cardamom');
        await expect(pear).toBeVisible();
        await expect(pear).toHaveAttribute('data-ckc-outside-filter', 'true');
        await expect(pear).toContainText('In your case');
        await pear.getByRole('button', { name: /Remove/ }).click();
        await expect(pear).toHaveAttribute('data-cc-quantity', '1');

        await page.getByTestId('ckc-clear-filters').click();
        await expect(cards(page)).toHaveCount(10);
        await expect(pear).not.toHaveAttribute('data-ckc-outside-filter', 'true');
    });

    test('filters the theme editor turned off are not drawn', async ({ page }) => {
        await openWidget(page, { content: { showFacets: false } });
        await expect(cards(page).first()).toBeVisible();
        await expect(page.getByTestId('ckc-facets')).toHaveCount(0);
    });
});

test.describe('discount ladder', () => {
    test('says what the next tier is worth: the theme\'s copy, then each tier\'s own customText, then the top', async ({ page }) => {
        // 24 presses. In CI, Linux WebKit renders in software and each press costs more as the case
        // fills (0.6s at the first can, 2.7s by the twentieth), so the whole climb needs more than the
        // default 30s. On a GPU-backed browser it takes about a second.
        test.slow();
        await openWidget(page);
        await expect(ladder(page)).toHaveText('Add 6 more to unlock 5% off');
        await pick(page, 'passionfruit-mojito', 7);
        await expect(ladder(page)).toHaveText('5 more cans and the whole case is 10% off.');
        await expect(ladder(page)).toHaveAttribute('data-ckc-custom', 'true');
        await pick(page, 'pear-cardamom', 5);
        await expect(ladder(page)).toHaveText('Go big: 12 more for 15% off. You are on 10% now.');
        // The ladder describes; the SDK prices. At 12 cans of £4.50 the two agree on 10% off.
        expect(await priceValue(page)).toBeCloseTo(12 * 4.5 * 0.9, 2);
        await pick(page, 'grapefruit-rosemary', 12);
        await expect(ladder(page)).toHaveText('Top tier unlocked: 15% off the whole case');
        await expect(page.getByTestId('ckc-ladder')).toHaveAttribute('data-ckc-at-top', 'true');
    });

    test('a can taken out of the case through its slot comes off the ladder too', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'passionfruit-mojito', 6);
        await expect(ladder(page)).toContainText('10% off');
        await page.getByTestId('ckc-slots').getByRole('button', { name: /Remove Passionfruit Mojito/ }).first().click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '5');
        await expect(ladder(page)).toHaveText('Add 1 more to unlock 5% off');
    });
});

test.describe('rules other than a count', () => {
    test('a case of 7 when the merchant sells 6, 12 or 24 is refused in the merchant\'s words, and Surprise me fills to 12', async ({ page }) => {
        const fixtures = loadFixtures().map((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [6, 12, 24].map((value) => ({ operation: 'eq' as const, sectionId: null, type: 'total-number-of-products' as const, value: `${value}.00` })),
            },
        }));
        const backend = createMockBackend({ fixtures });
        await openWidget(page, { backend });
        await pick(page, 'passionfruit-mojito', 7);
        // Nothing is missing by count (7 is inside 6 to 24), so the SDK's isSatisfied is the only judge.
        await expect(widget(page)).toHaveAttribute('data-complete', 'false');
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(status(page)).toHaveText('This combination cannot be bought as it is. Please change your selection.');
        await expect(surprise(page)).toContainText('Fill to 12');
        await surprise(page).click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '12');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
    });
});

test.describe('surprise me', () => {
    test('fills to the next size worth stopping at, never with the sold-out can', async ({ page }) => {
        await openWidget(page);
        await expect(surprise(page)).toContainText('Fill to 6');
        await surprise(page).click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '6');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await expect(product(page, 'watermelon-basil')).toHaveAttribute('data-cc-quantity', '0');
        await expect(surprise(page)).toContainText('Fill to 12');
        await surprise(page).click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '12');
    });

    test('steps around a can at its stock ceiling, and stops at a full case', async ({ page }) => {
        await openWidget(page);
        await pick(page, 'spicy-pineapple-marg', 4);
        await surprise(page).click();
        await surprise(page).click();
        await surprise(page).click();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '24');
        await expect(product(page, 'spicy-pineapple-marg')).toHaveAttribute('data-cc-quantity', '4');
        await expect(product(page, 'watermelon-basil')).toHaveAttribute('data-cc-quantity', '0');

        // Refused, but still pressable, so it can say why.
        await expect(surprise(page)).toHaveAttribute('aria-disabled', 'true');
        await surprise(page).click({ force: true });
        await expect(page.locator('.ckc-surprise__note')).toHaveText('Your case is full. Take one out to make room.');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '24');
    });
});

test.describe('subscribe and save', () => {
    test('a new plan: the email is checked before anything is sent, then configure and the cart lines carry it', async ({ page }) => {
        const { backend } = await openWidget(page);
        await completeSelection(page);
        const oneTime = await priceValue(page);

        await page.locator('[data-ckc-plan="71"]').check();
        await page.locator('label:has([data-ckc-frequency="4-weeks"])').click();
        // The plan's discount is priced by the SDK: an extra 10% on top of the 5% case tier.
        await expect.poll(() => priceValue(page)).toBeCloseTo(oneTime * 0.9, 1);
        await expect(buyButton(page)).toHaveText('Join the club and add to cart');

        // No email: refused, said, and nothing sent.
        await expect(buyButton(page)).toHaveAttribute('aria-disabled', 'true');
        await expect(status(page)).toHaveText('Enter your email so we can send your reminders.');
        await buyButton(page).click({ force: true });
        await expect(page.locator('[data-ckc-email]')).toBeFocused();
        await expect(page.getByTestId('ckc-plan-problem')).toHaveText('Enter your email so we can send your reminders.');
        await page.locator('[data-ckc-email]').fill('sam@');
        await expect(page.getByTestId('ckc-plan-problem')).toHaveText('That email does not look right. Check it and try again.');
        await buyButton(page).click({ force: true });
        expect(requestsTo(backend, /configure|cart\/add/)).toHaveLength(0);

        await page.locator('[data-ckc-email]').fill('sam@example.com');
        await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
        await buyButton(page).click();
        await page.waitForURL('**/cart');

        const configure = requestsTo(backend, /configure$/)[0]!.body as { subscription?: unknown };
        expect(configure.subscription).toEqual({ id: 71, email: 'sam@example.com', frequency: 4, unit: 'weeks' });
        const lines = backend.state.cart.items;
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line.properties).toMatchObject({
                _bundle_frequency: '4-weeks',
                Frequency: 'Every 4 weeks',
                Email: 'sam@example.com',
                _subscription_email: 'sam@example.com',
                _subscription_id: 'mock-subscription-9001',
            });
        }
    });

    test('the theme\'s words reach the cart line\'s visible properties', async ({ page }) => {
        const { backend } = await openWidget(page, { content: { propertyFrequency: 'Rappel', frequencyWeeks: 'Toutes les {count} semaines' } });
        await completeSelection(page);
        await page.locator('[data-ckc-plan="71"]').check();
        await page.locator('[data-ckc-email]').fill('sam@example.com');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        expect(backend.state.cart.items[0]!.properties).toMatchObject({ Rappel: 'Toutes les 2 semaines', _bundle_frequency: '2-weeks' });
    });

    test('a reminder\'s reorder link: fetched with the subscription, sent as a reorder, at the member price', async ({ page }) => {
        const backend = serveReorderLinks(createMockBackend({ fixtures: loadFixtures() }));
        await openWidget(page, { backend, query: `?subscription=${DEMO_SUBSCRIPTION.id}` });
        await expect(page.getByTestId('ckc-reorder-notice')).toContainText('Every 4 weeks');
        expect(requestsTo(backend, /\/bundles\/\d+$/)[0]!.query.subscription).toBe(DEMO_SUBSCRIPTION.id);
        // A reorder is not a new choice: no plan to pick, no email to type.
        await expect(page.locator('[data-ckc-plan]')).toHaveCount(0);
        await expect(page.locator('[data-ckc-email]')).toHaveCount(0);

        await completeSelection(page);
        await expect(buyButton(page)).toHaveText('Reorder this case');
        // 6 cans at £4.50, 5% case tier, then the subscription's 10%.
        expect(await priceValue(page)).toBeCloseTo(6 * 4.5 * 0.95 * 0.9, 1);
        await buyButton(page).click();
        await page.waitForURL('**/cart');

        const configure = requestsTo(backend, /configure$/)[0]!.body as { subscriptionId?: string; subscription?: unknown };
        expect(configure.subscriptionId).toBe(DEMO_SUBSCRIPTION.id);
        expect(configure.subscription).toBeUndefined();
        for (const line of backend.state.cart.items) {
            expect(line.properties._subscription_id).toBe(DEMO_SUBSCRIPTION.id);
            expect(line.properties._subscription_email).toBeUndefined();
        }
    });

    test('an expired reorder link says so and sells a one-time case, with no subscription attached', async ({ page }) => {
        const backend = serveReorderLinks(createMockBackend({ fixtures: loadFixtures() }));
        await openWidget(page, { backend, query: '?subscription=sub_expired' });
        await expect(page.getByTestId('ckc-reorder-notice')).toContainText('expired');
        await expect(page.locator('[data-ckc-plan="one-time"]')).toBeChecked();
        await completeSelection(page);
        await expect(buyButton(page)).toHaveText('Add case to cart');
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const configure = requestsTo(backend, /configure$/)[0]!.body as Record<string, unknown>;
        expect(configure.subscription).toBeUndefined();
        expect(configure.subscriptionId).toBeUndefined();
        for (const line of backend.state.cart.items) expect(Object.keys(line.properties).filter((key) => /subscription|frequency/i.test(key))).toEqual([]);
    });
});

test.describe('theme', () => {
    test('the merchant\'s case colours, set by the section on the mount element, reach the case', async ({ page }) => {
        await openWidget(page, { head: '<style>#kitenzo-1 { --ckc-case: rgb(10, 60, 120); --ckc-case-ink: rgb(250, 240, 200); }</style>' });
        const rail = page.locator('.ckc-summary');
        await expect(rail).toHaveCSS('background-color', 'rgb(10, 60, 120)');
        await expect(rail).toHaveCSS('color', 'rgb(250, 240, 200)');
    });
});
