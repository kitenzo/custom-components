/*
 * A wine's details: its photographs, its description and the same controls as its card.
 *
 * A native <dialog> opened with showModal(). It renders in the browser's top layer, so a theme
 * ancestor with `transform` or `container-type` (which traps `position: fixed`) cannot pull it off
 * screen, and the browser gives it focus trapping, Escape and a backdrop for free. That is the one
 * piece of UI a framework would not have helped with anyway.
 *
 * The body is built when the dialog opens and updated by the same render as everything else, from
 * the same Pick as the card, so a stock change shows up while it is open.
 */
import { text } from '../content';
import { h, setAttr } from '../dom';
import type { Ctx } from './context';
import { closeIcon } from './icons';
import { image } from './images';
import { createControls, type Pick } from './pick';

export interface Dialog {
    el: HTMLDialogElement;
    open: (pick: Pick) => void;
    update: () => void;
    close: () => void;
}

let dialogs = 0;

export function createDialog(ctx: Ctx): Dialog {
    const { content, money } = ctx;
    // Two sections on one page means two dialogs: each needs its own title id.
    const titleId = `vnc-dialog-title-${(dialogs += 1)}`;
    const el = h('dialog', {
        class: 'vnc-dialog',
        'data-testid': 'cc-dialog',
        'aria-labelledby': titleId,
        // A click on the backdrop lands on the dialog element itself.
        onclick: (event) => {
            if (event.target === el) el.close();
        },
    });
    let update = () => {};
    el.addEventListener('close', () => {
        el.replaceChildren();
        update = () => {};
    });

    const open = (pick: Pick) => {
        const { product } = pick;
        const controls = createControls(ctx, pick);
        const main = h('div', { class: 'vnc-dialog__photo' });
        const show = (index: number) => {
            const photo = product.photos[index];
            main.replaceChildren(photo ? image(photo.url, 560, photo.alt || product.title) : '');
            thumbs.forEach((thumb, position) => setAttr(thumb, 'aria-current', position === index));
        };
        const thumbs =
            product.photos.length > 1
                ? product.photos.map((photo, position) =>
                      h(
                          'button',
                          { type: 'button', class: 'vnc-dialog__thumb', 'aria-label': photo.alt || `${product.title}, ${position + 1} of ${product.photos.length}`, onclick: () => show(position) },
                          image(photo.url, 64, ''),
                      ),
                  )
                : [];
        const price = content.hidePrices ? null : h('p', { class: 'vnc-card__price' }, money.format(money.unitPrice(pick.variant())));
        el.replaceChildren(
            h(
                'div',
                { class: 'vnc-dialog__inner' },
                h('button', { type: 'button', class: 'vnc-dialog__close', 'aria-label': text(content, 'close'), onclick: () => el.close() }, closeIcon()),
                h('div', { class: 'vnc-dialog__gallery' }, main, thumbs.length ? h('div', { class: 'vnc-dialog__thumbs' }, ...thumbs) : null),
                h(
                    'div',
                    { class: 'vnc-dialog__details' },
                    h('h3', { class: 'vnc-dialog__title', id: titleId }, product.title),
                    price,
                    product.description ? h('p', { class: 'vnc-dialog__description' }, product.description) : null,
                    controls.el,
                ),
            ),
        );
        show(0);
        update = () => {
            if (price) price.textContent = money.format(money.unitPrice(pick.variant()));
            controls.update();
        };
        if (!el.open) el.showModal();
    };

    return {
        el,
        open,
        update: () => update(),
        close: () => {
            if (el.open) el.close();
        },
    };
}
