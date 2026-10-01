/*
 * Is this the Shopify theme editor?
 *
 * Shopify sets `Shopify.designMode` only inside the editor, never on the live storefront, so it
 * is the one signal that separates "a merchant is configuring this section" from "a shopper is
 * looking at the page". The widget uses it to decide who a problem is explained to: the merchant
 * gets what failed and how to fix it; the shopper gets one short neutral line.
 */
export function isThemeEditor(): boolean {
    return Boolean((globalThis as { Shopify?: { designMode?: boolean } }).Shopify?.designMode);
}
