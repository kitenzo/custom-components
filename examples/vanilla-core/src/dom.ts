/*
 * The whole "framework": build an element, set an attribute, set some text.
 *
 * Every string that came from somewhere else (a product title, a merchant's setting, the cart's
 * error) reaches the page as a text node or an attribute value, so it can never become markup.
 * Nothing in this widget assigns `innerHTML`, and nothing should start to: one product titled
 * `<img src=x onerror=…>` is all it takes.
 */

type Child = Node | string | number | null | undefined | false;
type Listener = (event: Event) => void;
export type Attrs = Record<string, string | number | boolean | null | undefined | Listener>;

/**
 * `h('button', { class: 'vnc-add', onclick: add }, 'Add')`.
 *
 * `on…` keys become listeners; `true` sets the attribute (`"true"` for an `aria-` state, empty
 * otherwise); `false`, `null` and `undefined` leave it out, so a conditional attribute reads as one
 * expression.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
        if (typeof value === 'function') el.addEventListener(name.slice(2), value);
        else setAttr(el, name, value);
    }
    append(el, children);
    return el;
}

export function append(el: Element, children: Child[]): void {
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        el.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    }
}

/** Set or remove one attribute. A no-op when it already has that value, so updates are cheap. */
export function setAttr(el: Element, name: string, value: string | number | boolean | null | undefined): void {
    if (value === false || value === null || value === undefined) {
        if (el.hasAttribute(name)) el.removeAttribute(name);
        return;
    }
    // `aria-disabled=""` is not "true" to a screen reader: ARIA states spell it out.
    const next = value === true ? (name.startsWith('aria-') ? 'true' : '') : String(value);
    if (el.getAttribute(name) !== next) el.setAttribute(name, next);
}

/** Set an element's text. A no-op when unchanged, so a screen reader's live region is not re-announced. */
export function setText(el: Node, value: string): void {
    if (el.textContent !== value) el.textContent = value;
}

/** Show or hide with the `hidden` attribute (the reset makes it beat any `display` rule). */
export function show(el: HTMLElement, visible: boolean): void {
    if (el.hidden === visible) el.hidden = !visible;
}

/** Swap an element's children, keeping focus on the same kind of control if it was inside. */
export function replaceKeepingFocus(el: Element, children: Node[], focusSelector: string): void {
    const hadFocus = el.contains(document.activeElement);
    el.replaceChildren(...children);
    if (hadFocus) el.querySelector<HTMLElement>(focusSelector)?.focus();
}
