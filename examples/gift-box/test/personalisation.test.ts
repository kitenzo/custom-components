import { addBundleToCart, createAjaxCartOperations, type BundleDetail, type SectionSelections, type SubmitBundleResult } from '@kitenzo/core';
import { describe, expect, it, vi } from 'vitest';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend } from '../dev/mock/backend';
import {
    characterCount,
    checkAnswer,
    fieldIssues,
    fieldsFor,
    linePlan,
    personalisedFetch,
    withLineProperties,
    type Answers,
    type Field,
} from '../src/personalisation';
import { load, routeFetchTo } from './support';

async function setUp() {
    const { bundle } = await load();
    const product = (handle: string) => bundle.sections.flatMap((section) => section.products).find((entry) => entry.handle === handle)!;
    const [boxes, fill, cards] = bundle.sections as [BundleDetail['sections'][number], BundleDetail['sections'][number], BundleDetail['sections'][number]];
    const matchbox = product('engravable-brass-matchbox');
    const card = product('with-love-letterpress-card');
    const box = product('keepsake-gift-box');
    const candle = product('hand-poured-soy-candle');
    const engraving = fieldsFor(bundle, matchbox.id)[0]!;
    const message = fieldsFor(bundle, card.id)[0]!;
    const selections = (extra: SectionSelections = {}): SectionSelections => ({
        [boxes.id]: [{ variantId: box.variants[0]!.id, quantity: 1 }],
        [fill.id]: [
            { variantId: candle.variants[0]!.id, quantity: 1 },
            { variantId: matchbox.variants[0]!.id, quantity: 1 },
        ],
        [cards.id]: [{ variantId: card.variants[0]!.id, quantity: 1 }],
        ...extra,
    });
    return { bundle, boxes, fill, cards, matchbox, card, box, candle, engraving, message, selections };
}

const text = (overrides: Partial<Field> = {}): Field => ({ id: 'f', key: 'Key', label: 'Label', type: 'text', required: false, ...overrides });

describe('checkAnswer', () => {
    it('requires a required field, ignoring whitespace; an optional blank is fine', () => {
        expect(checkAnswer(text({ required: true }), '   ')).toEqual({ kind: 'missing', over: 0 });
        expect(checkAnswer(text({ required: true }), undefined)).toEqual({ kind: 'missing', over: 0 });
        expect(checkAnswer(text(), '')).toBeNull();
    });

    it('counts characters as the shopper sees them, after trimming', () => {
        const field = text({ characterLimit: 4 });
        expect(characterCount('café')).toBe(4);
        expect(checkAnswer(field, ' café ')).toBeNull();
        expect(checkAnswer(field, 'cafés!')).toEqual({ kind: 'too-long', over: 2 });
        expect(checkAnswer(field, '🎁🎁🎁🎁')).toBeNull();
    });

    it('accepts only a listed option for a dropdown, and "Yes" for a checkbox', () => {
        const dropdown = text({ type: 'dropdown', required: true, options: ['Gold', 'Silver'] });
        expect(checkAnswer(dropdown, 'Gold')).toBeNull();
        expect(checkAnswer(dropdown, 'Bronze')).toEqual({ kind: 'missing', over: 0 });
        const checkbox = text({ type: 'checkbox', required: true });
        expect(checkAnswer(checkbox, 'Yes')).toBeNull();
        expect(checkAnswer(checkbox, '')).toEqual({ kind: 'missing', over: 0 });
    });
});

describe('fieldIssues', () => {
    it('reports the required engraving only while the matchbox is in the box', async () => {
        const { bundle, fill, candle, matchbox, selections } = await setUp();
        expect(fieldIssues(bundle, selections(), {}).map((issue) => [issue.productTitle, issue.field.label, issue.kind])).toEqual([
            ['Engravable Brass Matchbox', 'Lid engraving', 'missing'],
        ]);
        const without = selections({ [fill.id]: [{ variantId: candle.variants[0]!.id, quantity: 2 }] });
        expect(fieldIssues(bundle, without, {})).toEqual([]);
        expect(fieldIssues(bundle, selections(), { [matchbox.id]: { 'pf-engraving': 'R & J' } })).toEqual([]);
    });

    it('reads the limit from the bundle, not from this file', async () => {
        const { bundle, matchbox, selections, engraving } = await setUp();
        const thirteen = { [matchbox.id]: { [engraving.id]: 'ABCDEFGHIJKLM' } };
        expect(fieldIssues(bundle, selections(), thirteen)).toEqual([expect.objectContaining({ kind: 'too-long', over: 1 })]);
        const longer = { ...bundle, personalisation: { ...bundle.personalisation, [matchbox.id]: [{ ...engraving, characterLimit: 20 }] } };
        expect(fieldIssues(longer, selections(), thirteen)).toEqual([]);
    });

    it('asks for a required product\'s fields too: it is in every box', async () => {
        const { bundle, candle } = await setUp();
        const withRequired: BundleDetail = {
            ...bundle,
            requiredProducts: [{ shopifyProductId: candle.id, quantity: 1, variantIds: [], product: candle }],
            personalisation: { [candle.id]: [text({ id: 'name', key: 'Name', required: true })] },
        };
        expect(fieldIssues(withRequired, {}, {}).map((issue) => issue.productTitle)).toEqual(['Hand-Poured Soy Candle']);
    });
});

describe('linePlan', () => {
    it('names each property by the field\'s frozen key, never its label, on every variant of its own product', async () => {
        const { bundle, matchbox, card, selections, engraving, message } = await setUp();
        const answers: Answers = { [matchbox.id]: { [engraving.id]: '  R & J 2026 ' }, [card.id]: { [message.id]: 'Happy anniversary' } };
        const plan = linePlan(bundle, selections(), answers);
        for (const variant of matchbox.variants) expect(plan.get(variant.id)).toEqual({ Engraving: 'R & J 2026' });
        expect(plan.get(card.variants[0]!.id)).toEqual({ 'Card message': 'Happy anniversary' });
        expect(plan.size).toBe(matchbox.variants.length + 1);
        expect(JSON.stringify([...plan.values()])).not.toMatch(/Lid engraving|Your message/);
    });

    it('leaves out a blank optional answer and any product not in the box', async () => {
        const { bundle, card, matchbox, fill, candle, selections, engraving, message } = await setUp();
        const answers: Answers = { [card.id]: { [message.id]: '   ' }, [matchbox.id]: { [engraving.id]: 'MUM' } };
        const noMatchbox = selections({ [fill.id]: [{ variantId: candle.variants[0]!.id, quantity: 2 }] });
        expect(linePlan(bundle, noMatchbox, answers).size).toBe(0);
    });
});

describe('withLineProperties', () => {
    it('adds the plan to matching lines, keeps the SDK\'s own properties winning, and leaves other lines alone', () => {
        const plan = new Map([['111', { Engraving: 'MUM', _bundle_data: 'forged' }]]);
        const body = {
            items: [
                { id: 111, quantity: 1, properties: { _bundle_data: '9001#8000#a' } },
                { id: 222, quantity: 2, properties: { _bundle_data: '9001#8000#a' } },
            ],
        };
        expect(withLineProperties(body, plan)).toEqual({
            items: [
                { id: 111, quantity: 1, properties: { Engraving: 'MUM', _bundle_data: '9001#8000#a' } },
                { id: 222, quantity: 2, properties: { _bundle_data: '9001#8000#a' } },
            ],
        });
    });
});

describe('personalisedFetch', () => {
    it('rewrites only the POST to /cart/add.js, with or without a locale prefix', async () => {
        const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
        const plan = new Map([['111', { Engraving: 'MUM' }]]);
        const send = personalisedFetch(() => plan, () => base as unknown as typeof fetch);
        const add = JSON.stringify({ items: [{ id: 111, quantity: 1, properties: {} }] });

        await send('/en-gb/cart/add.js', { method: 'POST', body: add });
        expect(JSON.parse(base.mock.calls[0]![1]!.body as string).items[0].properties).toEqual({ Engraving: 'MUM' });

        await send('/cart/update.js', { method: 'POST', body: add });
        expect(base.mock.calls[1]![1]!.body).toBe(add);
        await send('/cart.js', { headers: { Accept: 'application/json' } });
        expect(base.mock.calls[2]![0]).toBe('/cart.js');
    });

    it('reads the plan when the request goes out, not when the fetch was made', async () => {
        const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
        let plan = new Map<string, Record<string, string>>();
        const send = personalisedFetch(() => plan, () => base as unknown as typeof fetch);
        plan = new Map([['111', { Engraving: 'LATER' }]]);
        await send('/cart/add.js', { method: 'POST', body: JSON.stringify({ items: [{ id: 111, quantity: 1 }] }) });
        expect(JSON.parse(base.mock.calls[0]![1]!.body as string).items[0].properties).toEqual({ Engraving: 'LATER' });
    });

    it('through the SDK\'s own cart choreography: two boxes, each line carrying its own box\'s answers', async () => {
        const { bundle, matchbox, card, selections, engraving, message } = await setUp();
        const backend = createMockBackend({ fixtures: loadFixtures() });
        let plan = new Map<string, Record<string, string>>();
        const cart = createAjaxCartOperations({ fetchImpl: personalisedFetch(() => plan, () => routeFetchTo(backend)) });
        const result = (configuredBundleId: number): SubmitBundleResult => ({
            configuredBundleId,
            variantId: '8000000002004',
            productId: '7000000002004',
            discount: `signed-${configuredBundleId}`,
            subscriptionId: null,
            pricing: { originalPrice: '0.00', discountedPrice: '0.00', discountType: null, discountValue: null, currency: 'GBP' },
        });

        plan = linePlan(bundle, selections(), { [matchbox.id]: { [engraving.id]: 'R & J' }, [card.id]: { [message.id]: 'Happy anniversary' } });
        await addBundleToCart(result(9001), cart, { bundle, selections: selections() });
        plan = linePlan(bundle, selections(), { [matchbox.id]: { [engraving.id]: 'MUM' }, [card.id]: { [message.id]: 'Welcome home' } });
        await addBundleToCart(result(9002), cart, { bundle, selections: selections() });

        const answersOf = (configured: string) =>
            backend.state.cart.items
                .filter((item) => item.properties._bundle_data?.startsWith(`${configured}#`))
                .flatMap((item) => Object.entries(item.properties).filter(([key]) => !key.startsWith('_')).map(([key, value]) => `${item.product_title}: ${key}=${value}`))
                .sort();
        expect(answersOf('9001')).toEqual(['Engravable Brass Matchbox: Engraving=R & J', 'With Love Letterpress Card: Card message=Happy anniversary']);
        expect(answersOf('9002')).toEqual(['Engravable Brass Matchbox: Engraving=MUM', 'With Love Letterpress Card: Card message=Welcome home']);
        expect(Object.keys(JSON.parse(backend.state.cart.attributes._bundles!))).toEqual(['9001', '9002']);
    });
});
