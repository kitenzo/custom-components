/*
 * One wine on the shelf.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the Shopify
 * handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how many of
 * it are in this step). The suites find and drive products through these, never through class
 * names or copy.
 */
import { text } from '../content';
import { h, setAttr, setText, show } from '../dom';
import type { ViewProduct, ViewSection } from '../model';
import type { Ctx } from './context';
import { image } from './images';
import { createControls, type Pick } from './pick';

export interface Card {
    el: HTMLElement;
    product: ViewProduct;
    update: () => void;
}

export function createCard(ctx: Ctx, pick: Pick, section: ViewSection): Card {
    const { product } = pick;
    const { content, money } = ctx;
    const photo = product.photos[0];
    const controls = createControls(ctx, pick);
    const price = h('p', { class: 'vnc-card__price' });
    const capsule = h('span', { class: 'vnc-card__capsule', 'aria-hidden': 'true' });
    capsule.style.setProperty('--vnc-capsule', ctx.capsule(product.id));

    const el = h(
        'article',
        { class: `vnc-card${product.soldOut ? ' vnc-card--sold-out' : ''}`, 'data-cc-product': product.handle, 'data-cc-unavailable': product.soldOut ? 'true' : null },
        h(
            'button',
            { type: 'button', class: 'vnc-card__media', 'aria-label': `${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`, onclick: () => ctx.openDetails(product.id, section.id) },
            photo ? image(photo.url, 320, photo.alt, true) : h('span', { class: 'vnc-card__placeholder', 'aria-hidden': 'true' }, product.title.slice(0, 1)),
            product.soldOut ? h('span', { class: 'vnc-badge' }, text(content, 'soldOut')) : null,
        ),
        h('div', { class: 'vnc-card__body' }, h('h4', { class: 'vnc-card__title' }, capsule, product.title), price, controls.el),
    );

    const update = () => {
        const selections = ctx.state().selections[section.id] ?? [];
        const inStep = selections.filter((entry) => product.variants.some((variant) => variant.id === entry.variantId)).reduce((total, entry) => total + entry.quantity, 0);
        setAttr(el, 'data-cc-quantity', inStep);
        el.classList.toggle('vnc-card--chosen', inStep > 0);
        const amount = money.unitPrice(pick.variant());
        show(price, !content.hidePrices);
        setText(price, content.hidePrices ? '' : money.format(amount));
        setAttr(price, 'data-price-value', content.hidePrices ? null : amount.toFixed(2));
        controls.update();
    };
    update();
    return { el, product, update };
}
