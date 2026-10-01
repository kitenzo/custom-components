/*
 * The states that are not the builder: loading, a bundle that cannot load, a bundle that cannot
 * be sold.
 *
 * Every one renders inside the widget root with `cc-root` on it, so the page never goes blank and
 * a test can always find the widget. In the theme editor the merchant is told what failed and how
 * to fix it; on the storefront the shopper gets one short, neutral line. A merchant-facing reason
 * never goes to `console.warn` only: nobody reads the console of a live store.
 */
import { h } from '../dom';
import { infoIcon } from './icons';

const stateRoot = (...children: (Node | null)[]) =>
    h('div', { class: 'vnc-root vnc-root--state', 'data-testid': 'cc-root', 'data-complete': 'false', 'data-qa-count': '0' }, ...children);

/** The size of the case it stands in for, so nothing below the widget jumps when it lands. */
export function loading(): HTMLElement {
    return stateRoot(
        h(
            'div',
            { class: 'vnc-loading', 'data-testid': 'cc-loading', role: 'status', 'aria-label': 'Loading' },
            h('span', { class: 'vnc-loading__bar' }),
            h('span', { class: 'vnc-loading__bar' }),
            h('span', { class: 'vnc-loading__bar' }),
        ),
    );
}

export function errorState(message: string, detail: string, editor: boolean): HTMLElement {
    return stateRoot(h('div', { class: 'vnc-error', 'data-testid': 'cc-error', role: 'alert' }, h('p', {}, message)), editor && detail ? editorPanel(h('p', {}, detail)) : null);
}

/** Only ever rendered in the theme editor. Styled to look like Shopify's own, not like the store. */
export function editorPanel(body: Node): HTMLElement {
    return h(
        'div',
        { class: 'vnc-editor-panel', 'data-testid': 'cc-editor-panel' },
        infoIcon(),
        h('div', {}, h('p', { class: 'vnc-editor-panel__title' }, 'Only you can see this (theme editor)'), body),
    );
}
