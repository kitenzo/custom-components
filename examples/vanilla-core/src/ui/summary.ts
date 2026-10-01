/*
 * The case: what is in it, what it costs, and the button that buys it. As a rail beside the shelf
 * on wide screens, and as a bar stuck to the bottom of the widget on narrow ones.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 */
import { text } from '../content';
import { h, setAttr, setText, show } from '../dom';
import { caseSize } from '../model';
import { casePrice } from '../money';
import { countOf } from '../selection';
import type { Ctx } from './context';
import { bottle, closeIcon } from './icons';
import { image } from './images';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
}

export interface Region {
    el: HTMLElement;
    update: () => void;
}

/**
 * Every bottle in the case, one entry per bottle: what its slots are filled with. Required products
 * that no step offers go in first (they are in every case, and the engine counts them), then the
 * shopper's picks in shelf order.
 */
function bottlesInCase(ctx: Ctx): string[] {
    const selections = ctx.state().selections;
    const inSteps = new Set(ctx.model.sections.flatMap((section) => section.products.map((product) => product.id)));
    const required = ctx.model.required
        .filter((entry) => !inSteps.has(entry.product.id))
        .flatMap((entry) => Array.from({ length: entry.quantity }, () => entry.product.id));
    return required.concat(ctx.model.sections.flatMap((section) =>
        (selections[section.id] ?? []).flatMap((pick) => {
            const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
            return product ? Array.from({ length: pick.quantity }, () => product.id) : [];
        }),
    ));
}

/**
 * The case itself: one slot per bottle it holds, filling as the shopper chooses. Decorative
 * (`aria-hidden`); the caption under it says the same thing in words.
 */
function createCaseGraphic(ctx: Ctx, compact: boolean): Region | null {
    const size = caseSize(ctx.model);
    // The bar's case stands in one row: past a dozen it is a count, not a picture.
    if (!size || (compact && size.slots > 12)) return null;
    const slots = Array.from({ length: size.slots }, (_, index) =>
        h('span', { class: `vnc-slot${index >= size.required ? ' vnc-slot--optional' : ''}` }, bottle()),
    );
    const grid = h('div', { class: 'vnc-case__grid', 'aria-hidden': 'true' }, ...slots);
    // Two rows, the way a case is packed: 6 is 3 by 2, 12 is 6 by 2. Small cases stand in one row.
    grid.style.setProperty('--vnc-case-columns', String(size.slots <= 4 || compact ? size.slots : Math.ceil(size.slots / 2)));
    const caption = h('p', { class: 'vnc-case__caption' });
    const el = h('div', { class: `vnc-case${compact ? ' vnc-case--compact' : ''}` }, grid, caption);

    const update = () => {
        const filled = bottlesInCase(ctx);
        slots.forEach((slot, index) => {
            const productId = filled[index];
            setAttr(slot, 'data-filled', productId !== undefined);
            if (productId) slot.style.setProperty('--vnc-capsule', ctx.capsule(productId));
            else slot.style.removeProperty('--vnc-capsule');
        });
        setText(caption, text(ctx.content, 'caseCount', { count: filled.length, size: size.slots }));
        el.classList.toggle('vnc-case--full', filled.length >= size.slots);
    };
    update();
    return { el, update };
}

function createPrice(ctx: Ctx, compact: boolean): Region | null {
    const { content, money, model, settings } = ctx;
    // Hidden prices are not rendered at all: a hidden element still carries a price in the DOM.
    if (content.hidePrices) return null;
    const compare = h('s', { class: 'vnc-price__compare', 'data-testid': 'cc-compare-at' });
    const total = h('strong', { class: 'vnc-price__total', 'data-testid': 'cc-price' });
    const saving = compact ? null : h('span', { class: 'vnc-price__saving', 'data-testid': 'cc-saving' });
    const el = h(
        'div',
        { class: `vnc-price${compact ? ' vnc-price--compact' : ''}` },
        h('span', { class: 'vnc-price__label' }, text(content, 'total')),
        h('span', { class: 'vnc-price__amounts' }, compare, total),
        saving,
    );

    const update = () => {
        const price = casePrice(model.bundle, ctx.state().selections, settings);
        show(el, price !== null);
        if (!price) return;
        setText(total, money.format(price.total));
        setAttr(total, 'data-price-value', price.total.toFixed(2));
        const saved = price.original === null ? 0 : price.original - price.total;
        show(compare, saved > 0);
        setText(compare, price.original === null ? '' : money.format(price.original));
        setAttr(compare, 'data-price-value', price.original?.toFixed(2));
        if (saving) {
            show(saving, saved > 0);
            setText(saving, saved > 0 ? text(content, 'saving', { amount: money.format(saved) }) : '');
            setAttr(saving, 'data-price-value', saved > 0 ? saved.toFixed(2) : null);
        }
    };
    update();
    return { el, update };
}

/**
 * The buy button and its two live regions. Both regions are always in the page and only their
 * text changes: a screen reader announces a live region's change, not its arrival, so a region
 * created with the message already in it is never read out.
 */
function createBuy(ctx: Ctx, buy: () => BuyState): Region & { status: HTMLElement } {
    const { content } = ctx;
    const button = h('button', { type: 'button', class: 'vnc-button vnc-button--primary vnc-buy', 'data-testid': 'cc-add-to-cart', onclick: () => buy().onAdd() });
    const polite = h('p', { class: 'vnc-status', role: 'status' });
    const alert = h('p', { class: 'vnc-status vnc-status--error', role: 'alert', 'data-testid': 'cc-cart-error' });
    const status = h('div', { class: 'vnc-status-wrap' }, polite, alert);
    const update = () => {
        const state = buy();
        const cart = ctx.cart();
        setText(button, cart.busy ? text(content, 'adding') : cart.added ? text(content, 'added') : text(content, 'addToCart'));
        setAttr(button, 'aria-disabled', !state.canAdd || cart.busy);
        setAttr(button, 'aria-busy', cart.busy);
        setText(polite, state.statusIsError ? '' : state.status);
        setText(alert, state.statusIsError ? state.status : '');
    };
    update();
    return { el: button, status, update };
}

export function createRail(ctx: Ctx, buy: () => BuyState): Region {
    const { content, model } = ctx;
    const graphic = createCaseGraphic(ctx, false);
    const price = createPrice(ctx, false);
    const action = createBuy(ctx, buy);
    const empty = h('p', { class: 'vnc-summary__empty' }, text(content, 'summaryEmpty'));
    const list = h('ul', { class: 'vnc-summary__lines', 'aria-label': text(content, 'summaryHeading') });
    // Removing a line removes the button that was pressed; focus goes to the heading, not the page.
    const heading = h('h3', { class: 'vnc-summary__heading', tabindex: '-1' }, text(content, 'summaryHeading'));

    const required = model.required.map((entry) =>
        h(
            'li',
            { class: 'vnc-line' },
            entry.product.photos[0] ? image(entry.product.photos[0].url, 48, '') : h('span', { class: 'vnc-line__thumb' }),
            h('span', { class: 'vnc-line__title' }, entry.quantity > 1 ? `${entry.quantity} × ` : '', entry.product.title),
            h('span', { class: 'vnc-line__tag' }, text(content, 'included')),
        ),
    );

    const el = h(
        'aside',
        { class: 'vnc-summary', 'aria-label': text(content, 'summaryHeading') },
        heading,
        graphic?.el,
        empty,
        list,
        price?.el,
        action.el,
        action.status,
    );

    let signature = '';
    const update = () => {
        graphic?.update();
        price?.update();
        action.update();
        const selections = ctx.state().selections;
        const lines = model.sections.flatMap((section) =>
            (selections[section.id] ?? []).flatMap((pick) => {
                const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
                const variant = product?.variants.find((candidate) => candidate.id === pick.variantId);
                return product && variant ? [{ section, product, variant, quantity: pick.quantity }] : [];
            }),
        );
        show(empty, lines.length === 0 && required.length === 0);
        // The list only changes when the case does; rebuilding it on every render would steal focus
        // from a remove button mid-press.
        const next = `${ctx.locked()}|${lines.map((line) => `${line.section.id}:${line.variant.id}:${line.quantity}`).join(',')}`;
        if (next === signature) return;
        signature = next;
        list.replaceChildren(
            ...required,
            ...lines.map(({ section, product, variant, quantity }) => {
                const thumb = product.photos[0] ? image(product.photos[0].url, 48, '') : h('span', { class: 'vnc-line__thumb' });
                thumb.classList.add('vnc-line__thumb');
                const capsule = h('span', { class: 'vnc-card__capsule', 'aria-hidden': 'true' });
                capsule.style.setProperty('--vnc-capsule', ctx.capsule(product.id));
                return h(
                    'li',
                    { class: 'vnc-line' },
                    thumb,
                    h(
                        'span',
                        { class: 'vnc-line__title' },
                        capsule,
                        quantity > 1 ? `${quantity} × ` : '',
                        product.title,
                        variant.title !== 'Default Title' ? h('span', { class: 'vnc-line__variant' }, variant.title) : null,
                    ),
                    h(
                        'button',
                        {
                            type: 'button',
                            class: 'vnc-icon-button',
                            'aria-label': `${text(content, 'remove')} ${product.title}`,
                            'aria-disabled': ctx.locked(),
                            onclick: () => {
                                if (ctx.locked()) return;
                                ctx.builder.removeItem(section.id, variant.id);
                                heading.focus();
                            },
                        },
                        closeIcon(),
                    ),
                );
            }),
        );
    };
    for (const node of required) node.querySelector('img')?.classList.add('vnc-line__thumb');
    update();
    return { el, update };
}

export function createMobileBar(ctx: Ctx, buy: () => BuyState): Region {
    const graphic = createCaseGraphic(ctx, true);
    const count = graphic ? null : h('span', { class: 'vnc-mobile-bar__count' });
    const price = createPrice(ctx, true);
    const action = createBuy(ctx, buy);
    const el = h(
        'div',
        { class: 'vnc-mobile-bar', 'data-testid': 'cc-mobile-bar' },
        h('div', { class: 'vnc-mobile-bar__info' }, graphic?.el, count, price?.el),
        action.el,
        action.status,
    );
    const update = () => {
        graphic?.update();
        if (count) setText(count, String(countOf(ctx.state().selections)));
        price?.update();
        action.update();
    };
    update();
    return { el, update };
}
