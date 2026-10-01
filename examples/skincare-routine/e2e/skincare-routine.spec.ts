/*
 * What this example adds to the conformance suite: the quiz, the routine it seeds, and the wizard
 * that adjusts it. Driven through the test contract plus this widget's own test ids (`cc-quiz`,
 * `cc-routine`, `cc-wizard`) and `data-cc-answer` / `data-cc-step`.
 */
import { expect, test } from '@playwright/test';

import { createMockBackend } from '../dev/mock/backend';
import { loadFixtures } from '../dev/catalog';
import { answerQuiz, buyButton, openStep, openWidget, pick, product, requestsTo, skipQuiz, widget } from './harness';

const routineLines = (page: import('@playwright/test').Page) => page.getByTestId('cc-routine-line');

test.describe('quiz', () => {
    test('opens on the quiz, with nothing picked and nothing on offer yet', async ({ page }) => {
        await openWidget(page);
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await expect(page.locator('[data-cc-product]')).toHaveCount(0);
    });

    test('the answers build the routine, and its first paint already holds it, with a reason per product', async ({ page }) => {
        const { backend } = await openWidget(page);
        await answerQuiz(page, ['q1a1', 'q2a2', 'q3a1']); // dry, dullness, mornings
        // Seeded at creation: the routine is there on the first paint, with no request in between.
        await expect(page.getByTestId('cc-routine')).toBeVisible();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        expect(requestsTo(backend, /configure|cart/)).toHaveLength(0);

        await expect(routineLines(page)).toHaveCount(3);
        await expect(routineLines(page).nth(0)).toHaveAttribute('data-handle', 'squalane-camellia-cleansing-oil-balm');
        await expect(routineLines(page).nth(0)).toContainText('Matches: dry skin');
        await expect(routineLines(page).nth(1)).toHaveAttribute('data-handle', 'vitamin-c-ferulic-brightening-serum');
        await expect(routineLines(page).nth(1)).toContainText('brightening');
        await expect(routineLines(page).nth(2)).toContainText('Matches: very dry skin');
        await expect(buyButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('never recommends a sold-out product, or a sold-out size', async ({ page }) => {
        await openWidget(page);
        await answerQuiz(page, ['q1a4', 'q2a3', 'q3a2']); // sensitive, fine lines, evenings
        await expect(page.getByTestId('cc-routine')).toBeVisible();
        // The retinal serum matches "fine lines" and "evenings" best, and is sold out.
        await expect(page.locator('[data-handle="retinal-squalane-overnight-serum"]')).toHaveCount(0);
        // The cream cleanser's 75ml is sold out: it goes in at 150ml.
        await expect(routineLines(page).nth(0)).toHaveAttribute('data-handle', 'ceramide-oat-cream-cleanser');
        await expect(routineLines(page).nth(0)).toHaveAttribute('data-variant', '150ml');
    });

    test('adds the quiz\'s routine to the cart as it is', async ({ page }) => {
        const { backend } = await openWidget(page);
        await answerQuiz(page, ['q1a2', 'q2a1', 'q3a3']); // oily, breakouts, both
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const titles = backend.state.cart.items.map((item) => item.product_title);
        expect(titles).toEqual(expect.arrayContaining([expect.stringContaining('PHA 3%'), expect.stringContaining('Niacinamide'), expect.stringContaining('Hyaluronic')]));
    });

    test('Back keeps the answer, and a retake starts a new routine from the old answers', async ({ page }) => {
        await openWidget(page);
        await answerQuiz(page, ['q1a1', 'q2a2']);
        await expect(page.getByTestId('cc-quiz')).toHaveAttribute('data-question', 'q3');
        await page.getByTestId('cc-quiz').getByRole('button', { name: 'Back' }).click();
        await expect(page.locator('[data-cc-answer="q2a2"]')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('[data-cc-answer="q2a2"]').click();
        await page.locator('[data-cc-answer="q3a1"]').click();
        await page.getByTestId('cc-routine-retake').click();
        await expect(page.getByTestId('cc-quiz')).toBeVisible();
        await expect(widget(page)).toHaveAttribute('data-qa-count', '0');
        await page.getByTestId('cc-quiz-start').click();
        await expect(page.locator('[data-cc-answer="q1a1"]')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('[data-cc-answer="q1a2"]').click(); // oily this time
        await page.locator('[data-cc-answer="q2a1"]').click();
        await page.locator('[data-cc-answer="q3a1"]').click();
        await expect(routineLines(page).nth(0)).toHaveAttribute('data-handle', 'pha-zinc-exfoliating-cleanser');
    });

    test('when nothing matches, the routine falls back and says so instead of claiming a match', async ({ page }) => {
        await openWidget(page, { content: { questions: [{ title: 'Skin?', hint: '', answers: [{ label: 'Dry', tags: 'no-such-tag' }] }] } });
        await answerQuiz(page, ['q1a1']);
        await expect(routineLines(page)).toHaveCount(3);
        await expect(routineLines(page).nth(0)).toHaveAttribute('data-handle', 'squalane-camellia-cleansing-oil-balm');
        // The first in Treat is in stock; the retinal serum, second, never would be chosen.
        await expect(routineLines(page).nth(1)).toHaveAttribute('data-handle', 'vitamin-c-ferulic-brightening-serum');
        for (const index of [0, 1, 2]) await expect(routineLines(page).nth(index)).toContainText('Our suggestion for this step');
        await expect(page.getByTestId('cc-routine')).not.toContainText('Matches:');
    });

    test('a merchant who removes every question block gets the wizard, with no quiz', async ({ page }) => {
        await openWidget(page, { content: { questions: [] } });
        await expect(page.getByTestId('cc-wizard')).toBeVisible();
        await expect(page.getByTestId('cc-quiz')).toHaveCount(0);
    });
});

test.describe('wizard', () => {
    test('Back while an answer is still landing goes back, and stays back', async ({ page }) => {
        await openWidget(page);
        await page.getByTestId('cc-quiz-start').click();
        await page.locator('[data-cc-answer="q1a1"]').click();
        await expect(page.getByTestId('cc-quiz')).toHaveAttribute('data-question', 'q2');
        await page.locator('[data-cc-answer="q2a1"]').click();
        await page.getByTestId('cc-quiz').getByRole('button', { name: 'Back' }).click();
        await page.waitForTimeout(500);
        await expect(page.getByTestId('cc-quiz')).toHaveAttribute('data-question', 'q1');
    });

    test('one step at a time, advancing by itself exactly where the merchant said to', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        await expect(page.locator('.skr-panel__title')).toHaveText('Cleanse');
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        // Cleanse has "advance when done" on.
        await expect(page.locator('.skr-panel__title')).toHaveText('Treat');
        await pick(page, 'niacinamide-zinc-blemish-serum');
        await expect(page.locator('.skr-panel__title')).toHaveText('Moisturise');
        await pick(page, 'hyaluronic-aloe-gel-cream');
        // Moisturise has it off: the shopper stays, and Continue takes them to the review.
        await page.waitForTimeout(800);
        await expect(page.locator('.skr-panel__title')).toHaveText('Moisturise');
        await expect(widget(page)).toHaveAttribute('data-complete', 'true');
        await page.getByTestId('cc-wizard-next').click();
        await expect(page.getByTestId('cc-routine')).toBeVisible();
        await expect(routineLines(page)).toHaveCount(3);
    });

    test('a step whose "advance when done" is off waits for Continue', async ({ page }) => {
        // Moisturise is the last step, so its setting cannot show; turn Cleanse's off instead.
        const fixtures = loadFixtures().map((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, sections: fixture.bundle.sections.map((section) => ({ ...section, autoNextSection: section.id === 21 ? false : section.autoNextSection })) },
        }));
        await openWidget(page, { backend: createMockBackend({ fixtures }) });
        await skipQuiz(page);
        await pick(page, 'amino-acid-gentle-gel-cleanser');
        await page.waitForTimeout(800);
        await expect(page.locator('.skr-panel__title')).toHaveText('Cleanse');
        await page.getByTestId('cc-wizard-next').click();
        await expect(page.locator('.skr-panel__title')).toHaveText('Treat');
    });

    test('Continue and a step ahead refuse until the step has its pick, and say why', async ({ page }) => {
        await openWidget(page);
        await skipQuiz(page);
        const next = page.getByTestId('cc-wizard-next');
        await expect(next).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.skr-nav__status')).toHaveText('Add 1 more to “Cleanse”');
        // `force`: Playwright will not press an aria-disabled control, and a shopper can.
        await next.click({ force: true });
        await expect(page.locator('.skr-panel__title')).toHaveText('Cleanse');
        await page.locator('[data-cc-step="23"]').click({ force: true });
        await expect(page.locator('[data-cc-step="23"]')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.skr-panel__title')).toHaveText('Cleanse');
    });

    test('Size swaps the chosen line in place, and a sold-out size cannot be picked', async ({ page }) => {
        await openWidget(page);
        await answerQuiz(page, ['q1a4', 'q2a4', 'q3a3']); // sensitive, redness, both
        await page.getByTestId('cc-routine-adjust').click();
        const oat = product(page, 'ceramide-oat-cream-cleanser');
        await expect(oat).toHaveAttribute('data-cc-quantity', '1');
        await expect(oat.locator('select')).toHaveValue('150ml');
        await expect(oat.locator('option[value="75ml"]')).toHaveJSProperty('disabled', true);

        // The moisturiser is swapped between sizes, and the routine still holds one.
        await openStep(page, 'Moisturise');
        const balm = product(page, 'centella-panthenol-barrier-balm');
        await expect(balm).toHaveAttribute('data-cc-quantity', '1');
        const before = await page.getByTestId('cc-price').filter({ visible: true }).first().getAttribute('data-price-value');
        await balm.locator('select').selectOption('50ml');
        await expect(balm.locator('select')).toHaveValue('50ml');
        await expect(balm).toHaveAttribute('data-cc-quantity', '1');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(page.getByTestId('cc-price').filter({ visible: true }).first()).not.toHaveAttribute('data-price-value', before!);
    });

    test('swapping a product shows which others also match the answers', async ({ page }) => {
        await openWidget(page);
        await answerQuiz(page, ['q1a1', 'q2a2', 'q3a1']);
        await page.getByTestId('cc-routine-adjust').click();
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm').locator('.skr-badge')).toHaveText('Recommended');
        await expect(product(page, 'ceramide-oat-cream-cleanser').getByTestId('cc-reason')).toHaveText('Matches: dry skin');
        await expect(product(page, 'pha-zinc-exfoliating-cleanser').getByTestId('cc-reason')).toHaveCount(0);
        await pick(page, 'ceramide-oat-cream-cleanser');
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm')).toHaveAttribute('data-cc-quantity', '0');
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
    });

    test('a basket Edit skips the quiz and opens the saved routine in the wizard', async ({ page }) => {
        const backend = createMockBackend({ fixtures: loadFixtures() });
        await openWidget(page, { backend });
        await answerQuiz(page, ['q1a1', 'q2a2', 'q3a1']);
        await buyButton(page).click();
        await page.waitForURL('**/cart');
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');

        await openWidget(page, { backend, query: `?edit=${configured}&edit_uid=${uid}` });
        await expect(page.getByTestId('cc-wizard')).toBeVisible();
        await expect(page.getByTestId('cc-quiz')).toHaveCount(0);
        await expect(widget(page)).toHaveAttribute('data-qa-count', '3');
        await expect(product(page, 'squalane-camellia-cleansing-oil-balm')).toHaveAttribute('data-cc-quantity', '1');
        // Every step is complete, so every pill opens.
        await page.locator('[data-cc-step="22"]').click();
        await expect(product(page, 'vitamin-c-ferulic-brightening-serum')).toHaveAttribute('data-cc-quantity', '1');
    });
});
