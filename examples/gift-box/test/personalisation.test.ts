import {
    createAjaxCartOperations,
    createBundleCartFlow,
    KitenzoClient,
    loadBundleEdit,
    personalisationFeeTotal,
    type BundleDetail,
    type BundleEditTarget,
    type SectionSelections,
} from '@kitenzo/core';
import { afterEach, describe, expect, it } from 'vitest';

import { loadFixtures, PAID_ENGRAVING_BUNDLE } from '../dev/catalog';
import { createMockBackend, type MockBackend } from '../dev/mock/backend';
import type { Fixture } from '../dev/mock/wire';
import { toViewModel } from '../src/model';
import { answersFromProperties, fieldIssues, fieldsFor, lineProperties, written, type Answers, type Field } from '../src/personalisation';
import { routeFetchTo } from './support';

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

/**
 * The bundle loaded through the SDK's client from a mock backend that stays up for the test, so
 * the same backend then takes the configure call and the cart requests.
 */
async function setUp(change: (fixture: Fixture) => Fixture = (fixture) => fixture, bundleId?: number) {
    const fixtures = loadFixtures();
    const fixture = change(fixtures.find((entry) => entry.bundle.id === bundleId) ?? fixtures[0]!);
    const backend = createMockBackend({ fixtures: [fixture] });
    globalThis.fetch = routeFetchTo(backend);
    const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1' });
    const [bundle, settings] = await Promise.all([client.getBundle(fixture.bundle.id), client.getSettings()]);
    const model = toViewModel(bundle, settings);
    const product = (handle: string) => model.sections.flatMap((section) => section.products).find((entry) => entry.handle === handle)!;
    const [boxes, fill, cards] = bundle.sections as [BundleDetail['sections'][number], BundleDetail['sections'][number], BundleDetail['sections'][number]];
    const matchbox = product('engravable-brass-matchbox');
    const card = product('with-love-letterpress-card');
    const box = product('keepsake-gift-box');
    const candle = product('hand-poured-soy-candle');
    const selections = (extra: SectionSelections = {}): SectionSelections => ({
        [boxes.id]: [{ variantId: box.variants[0]!.id, quantity: 1 }],
        [fill.id]: [
            { variantId: candle.variants[0]!.id, quantity: 1 },
            { variantId: matchbox.variants[0]!.id, quantity: 1 },
        ],
        [cards.id]: [{ variantId: card.variants[0]!.id, quantity: 1 }],
        ...extra,
    });
    const flow = (replace: BundleEditTarget | null = null) => createBundleCartFlow({ client, settings, replace, operations: createAjaxCartOperations({ fetchImpl: routeFetchTo(backend) }) });
    return { backend, client, bundle, model, boxes, fill, cards, matchbox, card, box, candle, boxed: [box, candle, matchbox, card], engraving: matchbox.fields[0]!, message: card.fields[0]!, selections, flow };
}

/** What the shopper wrote, per box, as "Product: key=value", read off the mock cart's lines. */
function answersOnLines(backend: MockBackend): string[][] {
    const groups = new Map<string, string[]>();
    for (const item of backend.state.cart.items) {
        const box = item.properties._bundle_data ?? 'none';
        const written = Object.entries(item.properties).filter(([key]) => !key.startsWith('_')).map(([key, value]) => `${item.product_title}: ${key}=${value}`);
        groups.set(box, [...(groups.get(box) ?? []), ...written].sort());
    }
    return [...groups.values()];
}

/** The cart's record of what each box was added with, by the box's instance id. */
function record(backend: MockBackend): Record<string, unknown> {
    return JSON.parse(backend.state.cart.attributes._kitenzo_properties ?? '{}');
}

const text = (overrides: Partial<Field> = {}): Field => ({ id: 'f', key: 'Key', label: 'Label', type: 'text', required: false, ...overrides });

describe('fieldsFor', () => {
    it('reads the fields from the bundle, and asks for none on a bundle whose lines cannot carry an answer', async () => {
        const { bundle, matchbox, candle } = await setUp();
        expect(fieldsFor(bundle, matchbox.id).map((field) => [field.key, field.label])).toEqual([['Engraving', 'Lid engraving']]);
        expect(fieldsFor(bundle, candle.id)).toEqual([]);
        expect(fieldsFor({ ...bundle, type: 'multiple-products' }, matchbox.id)).toEqual([]);
    });
});

describe('one answer', () => {
    it('is written as the SDK writes it: trimmed, a listed option only, a ticked box as "Yes"', () => {
        expect(written(text(), '  R & J  ')).toBe('R & J');
        expect(written(text(), '   ')).toBe('');
        const dropdown = text({ type: 'dropdown', options: ['Gold', 'Silver'] });
        expect(written(dropdown, 'Gold')).toBe('Gold');
        expect(written(dropdown, 'Bronze')).toBe('');
        expect(written(text({ type: 'checkbox' }), 'Yes')).toBe('Yes');
        expect(written(text({ type: 'checkbox' }), '')).toBe('');
    });

});

describe('fieldIssues', () => {
    it('reports the required engraving only while the matchbox is in the box', async () => {
        const { bundle, fill, candle, matchbox, box, card, boxed, selections } = await setUp();
        expect(fieldIssues(bundle, selections(), boxed, {}).map((issue) => [issue.productTitle, issue.field.label, issue.kind])).toEqual([
            ['Engravable Brass Matchbox', 'Lid engraving', 'missing'],
        ]);
        const without = selections({ [fill.id]: [{ variantId: candle.variants[0]!.id, quantity: 2 }] });
        expect(fieldIssues(bundle, without, [box, candle, card], {})).toEqual([]);
        expect(fieldIssues(bundle, selections(), boxed, { [matchbox.id]: { 'pf-engraving': 'R & J' } })).toEqual([]);
    });

    it('holds an answer the SDK would cut, by as much as the SDK counts, and nothing it would send whole', async () => {
        const { bundle, matchbox, boxed, engraving, selections } = await setUp((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'engravable-brass-matchbox')!.shopifyProductId;
            const fields = fixture.bundle.personalisation![id]!.map((field) => ({ ...field, characterLimit: 4 }));
            return { ...fixture, bundle: { ...fixture.bundle, personalisation: { ...fixture.bundle.personalisation, [id]: fields } } };
        });
        const over = (answer: string) => fieldIssues(bundle, selections(), boxed, { [matchbox.id]: { [engraving.id]: answer } }).map((issue) => [issue.kind, issue.over]);
        // Counted trimmed, in UTF-16 units: an emoji is two.
        expect(over(' café ')).toEqual([]);
        expect(over('cafés!')).toEqual([['too-long', 2]]);
        expect(over('ab🎁')).toEqual([]);
        expect(over('abc🎁')).toEqual([['too-long', 1]]);
        expect(over('🎁🎁🎁')).toEqual([['too-long', 2]]);
        // Whatever gets past the check reaches the cart as typed.
        for (const answer of ['abcd', 'ab🎁', '🎁🎁', '🎁🎁🎁', 'abc🎁', 'cafés!']) {
            expect(over(answer).length === 0).toBe(written(engraving, answer) === answer);
        }
    });

    it('reads the limit from the bundle, not from this file', async () => {
        const thirteen = (matchboxId: string) => ({ [matchboxId]: { 'pf-engraving': 'ABCDEFGHIJKLM' } });
        const short = await setUp();
        expect(fieldIssues(short.bundle, short.selections(), short.boxed, thirteen(short.matchbox.id))).toEqual([expect.objectContaining({ kind: 'too-long', over: 1 })]);

        const longer = await setUp((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'engravable-brass-matchbox')!.shopifyProductId;
            const fields = fixture.bundle.personalisation![id]!.map((field) => ({ ...field, characterLimit: 20 }));
            return { ...fixture, bundle: { ...fixture.bundle, personalisation: { ...fixture.bundle.personalisation, [id]: fields } } };
        });
        expect(fieldIssues(longer.bundle, longer.selections(), longer.boxed, thirteen(longer.matchbox.id))).toEqual([]);
    });

    it('asks for a required product\'s fields too: it is in every box', async () => {
        const { bundle, model, boxes, box } = await setUp((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'botanical-bath-soak')!.shopifyProductId;
            return {
                ...fixture,
                bundle: {
                    ...fixture.bundle,
                    sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== id) })),
                    requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }],
                    personalisation: { [id]: [text({ id: 'name', key: 'Name', required: true })] },
                },
            };
        });
        const soak = model.required[0]!.product;
        const onlyABox = { [boxes.id]: [{ variantId: box.variants[0]!.id, quantity: 1 }] };
        expect(fieldIssues(bundle, onlyABox, [box, soak], {}).map((issue) => issue.productTitle)).toEqual(['Botanical Bath Soak']);
        expect(fieldIssues(bundle, onlyABox, [box, soak], { [soak.id]: { name: 'Mum' } })).toEqual([]);
    });
});

describe('lineProperties', () => {
    it('names each answer by the field\'s frozen key, never its label, under its own product', async () => {
        const { bundle, matchbox, card, engraving, message } = await setUp();
        const answers: Answers = { [matchbox.id]: { [engraving.id]: '  R & J 2026 ' }, [card.id]: { [message.id]: 'Happy anniversary' } };
        expect(lineProperties(bundle, answers)).toEqual({
            byProduct: { [matchbox.id]: { Engraving: 'R & J 2026' }, [card.id]: { 'Card message': 'Happy anniversary' } },
        });
    });

    it('leaves out a blank optional answer', async () => {
        const { bundle, card, message } = await setUp();
        expect(lineProperties(bundle, { [card.id]: { [message.id]: '   ' } })).toEqual({ byProduct: {} });
    });
});

describe('through the SDK\'s cart flow, into the cart', () => {
    it('two boxes: each line carries its own box\'s answers, and both boxes stay discounted', async () => {
        const { backend, bundle, matchbox, card, engraving, message, selections, flow } = await setUp();
        const add = async (answers: Answers) => (await flow().addToCart(bundle, selections(), { properties: lineProperties(bundle, answers) })).ok;

        expect(await add({ [matchbox.id]: { [engraving.id]: 'R & J' }, [card.id]: { [message.id]: 'Happy anniversary' } })).toBe(true);
        expect(await add({ [matchbox.id]: { [engraving.id]: 'MUM' }, [card.id]: { [message.id]: 'Welcome home' } })).toBe(true);

        expect(answersOnLines(backend)).toEqual([
            ['Engravable Brass Matchbox: Engraving=R & J', 'With Love Letterpress Card: Card message=Happy anniversary'],
            ['Engravable Brass Matchbox: Engraving=MUM', 'With Love Letterpress Card: Card message=Welcome home'],
        ]);
        expect(JSON.stringify(backend.state.cart.items)).not.toMatch(/Lid engraving|Your message/);
        expect(Object.keys(JSON.parse(backend.state.cart.attributes._bundles!))).toHaveLength(2);
    });

    it('refuses a box whose required engraving is missing, before any request', async () => {
        const { backend, bundle, selections, flow } = await setUp();
        const cart = flow();
        const before = backend.requests.length;
        const outcome = await cart.addToCart(bundle, selections(), { properties: lineProperties(bundle, {}) });
        expect(outcome.ok).toBe(false);
        expect(cart.getState().failureReason).toBe('personalisation-required');
        expect(backend.requests.length).toBe(before);
    });

    it('an Edit reads back what the box was added with, checked against the fields as they are', async () => {
        const { backend, client, bundle, matchbox, card, engraving, message, selections, flow } = await setUp();
        const typed: Answers = { [matchbox.id]: { [engraving.id]: 'R & J' }, [card.id]: { [message.id]: 'Happy anniversary' } };
        await flow().addToCart(bundle, selections(), { properties: lineProperties(bundle, typed) });
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');

        const cart = createAjaxCartOperations({ fetchImpl: routeFetchTo(backend) });
        const edit = await loadBundleEdit(client, bundle, `?edit=${configured}&edit_uid=${uid}`, { cart });
        expect(answersFromProperties(bundle, edit.properties)).toEqual(typed);

        // The merchant has since made the engraving a choice of finishes: the stored text is not
        // one of them, so that field opens blank instead of holding an answer it cannot send.
        const changed: BundleDetail = { ...bundle, personalisation: { ...bundle.personalisation, [matchbox.id]: [{ ...engraving, type: 'dropdown', options: ['Brass', 'Black'] }] } };
        expect(answersFromProperties(changed, edit.properties)).toEqual({ [card.id]: { [message.id]: 'Happy anniversary' } });
        expect(answersFromProperties(bundle, null)).toEqual({});
    });

    it('an answer for a product taken back out reaches no line and no record of the box', async () => {
        const { backend, bundle, matchbox, card, engraving, message, selections, flow, fill, candle } = await setUp();
        const noMatchbox = selections({ [fill.id]: [{ variantId: candle.variants[0]!.id, quantity: 2 }] });
        const properties = lineProperties(bundle, { [matchbox.id]: { [engraving.id]: 'GONE' }, [card.id]: { [message.id]: 'Welcome home' } });
        expect(properties.byProduct).toHaveProperty(matchbox.id);
        expect((await flow().addToCart(bundle, noMatchbox, { properties })).ok).toBe(true);

        expect(answersOnLines(backend)).toEqual([['With Love Letterpress Card: Card message=Welcome home']]);
        expect(JSON.stringify(record(backend))).toContain('Welcome home');
        expect(JSON.stringify(backend.state.cart)).not.toContain('GONE');
    });

    it('after an Edit the cart\'s record holds the new box only', async () => {
        const { backend, client, bundle, matchbox, card, engraving, message, selections, flow } = await setUp();
        const typed = (text: string): Answers => ({ [matchbox.id]: { [engraving.id]: text }, [card.id]: { [message.id]: 'Happy anniversary' } });
        await flow().addToCart(bundle, selections(), { properties: lineProperties(bundle, typed('OLD')) });
        const [configured, , uid] = backend.state.cart.items[0]!.properties._bundle_data!.split('#');
        expect(Object.keys(record(backend))).toEqual([uid]);

        const cart = createAjaxCartOperations({ fetchImpl: routeFetchTo(backend) });
        const edit = await loadBundleEdit(client, bundle, `?edit=${configured}&edit_uid=${uid}`, { cart });
        expect((await flow(edit.replace).addToCart(bundle, edit.selections!, { properties: lineProperties(bundle, typed('NEW')) })).ok).toBe(true);

        const instances = new Set(backend.state.cart.items.map((item) => item.properties._bundle_data!.split('#')[2]));
        expect([...instances]).not.toContain(uid);
        expect(Object.keys(record(backend))).toEqual([...instances]);
        expect(JSON.stringify(record(backend))).toContain('NEW');
        expect(JSON.stringify(backend.state.cart)).not.toContain('OLD');
    });

    it('a filled field with a fee adds its fee line, and an empty one does not', async () => {
        const { backend, bundle, matchbox, engraving, selections, flow, fill, candle } = await setUp(undefined, PAID_ENGRAVING_BUNDLE);
        const properties = lineProperties(bundle, { [matchbox.id]: { [engraving.id]: 'R & J' } });
        expect(personalisationFeeTotal(bundle, selections(), properties)).toBe('4.00');
        expect((await flow().addToCart(bundle, selections(), { properties })).ok).toBe(true);
        // The fee's line is the fee option's own hidden product, titled with the option's name.
        const fees = backend.state.cart.items.filter((item) => item.properties._personalisation_fee);
        expect(fees.map((item) => [item.title, item.quantity, item.price, item.properties.For])).toEqual([['Engraving', 1, 400, 'Engravable Brass Matchbox (Engraving)']]);

        // The engraving is still typed, and its matchbox is out of the box: no unit carries it,
        // so nothing is charged for it.
        backend.reset();
        const noMatchbox = selections({ [fill.id]: [{ variantId: candle.variants[0]!.id, quantity: 2 }] });
        expect(personalisationFeeTotal(bundle, noMatchbox, properties)).toBe('0.00');
        expect((await flow().addToCart(bundle, noMatchbox, { properties })).ok).toBe(true);
        expect(backend.state.cart.items.some((item) => item.properties._personalisation_fee)).toBe(false);
    });

    it('is sent no fee for a bundle that is not native, whose lines could not charge it', async () => {
        const paid = await setUp(undefined, PAID_ENGRAVING_BUNDLE);
        expect(paid.engraving.fee).toMatchObject({ feeOptionId: 7, amount: '4.00', currencyCode: 'GBP', name: 'Engraving' });
        const classic = await setUp((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, type: 'multiple-products' } }), PAID_ENGRAVING_BUNDLE);
        expect(classic.bundle.personalisation![classic.matchbox.id]).toMatchObject([{ key: 'Engraving', feeOptionId: 7, fee: null }]);
    });
});
