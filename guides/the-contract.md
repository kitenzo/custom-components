# The contract

What a custom component promises to the theme it lives in, to the merchant who configures it, and to the tests that check it. Keep all three and any component can be dropped into any theme, configured by any merchant, and verified by the same suite.

## 1. The mount element

The Liquid section renders exactly one element per section:

```html
<div
  id="kitenzo-{{ section.id }}"
  data-<slug>-bundle="42"
  data-api-key="kit_live_…"
  data-shop-domain="store.myshopify.com"
  data-country-code="GB"
  data-root-url="/"
  data-content="{…the merchant's settings, as JSON…}"
></div>
```

| Attribute | From | Notes |
|---|---|---|
| `data-<slug>-bundle` | the bundle source (see below) | The whole attribute is a positive integer, or nothing renders. `"42x"` is not 42. |
| `data-api-key` | a section setting | Must start `kit_live_` or `kit_test_`. The SDK throws on anything else, so check before constructing the provider. |
| `data-shop-domain` | `shop.permanent_domain` | |
| `data-country-code` | `localization.country.iso_code` | Drives Markets pricing. Never hardcoded. |
| `data-root-url` | `routes.root_url` | `/`, or `/en-gb` on a store served under a locale path. Every cart route and the cart redirect are built from it. Never hardcoded. |
| `data-content` | every other setting | One JSON blob, captured in Liquid and escaped once (`| escape`), so an apostrophe cannot end the attribute early. |
| `data-layout` | a section setting, optional | When one asset ships more than one layout. |
| `data-api-base` | dev and tests only | Points the SDK at the mock backend. Never a merchant setting. |

### The bundle source

Every component's section opens with the same three settings, in this order:

1. **Bundle source**: "This product (automatic)" (the default) or "Selected bundle".
2. **Selected bundle**: a product picker, used when the source is "Selected bundle".
3. **Unpublished bundle ID**: a text box, the fallback when neither resolves a bundle.

Kitenzo writes each bundle's id to its own Shopify product as the `bundle-builder.bundle-id` metafield. With "This product", the merchant puts the section on one product template once, assigns that template to every bundle product, and never touches code or templates for a new bundle. A draft bundle's product is not in any picker, so the id box is how a merchant designs against a bundle before publishing it.

## 2. The script

`kitenzo-<slug>.js` is an IIFE. When it runs it mounts a widget on every `[data-<slug>-bundle]` on the page, and:

- keeps its registry of mounted elements on `window`, because every section loads its own copy of the script;
- remounts inside a section when the theme editor fires `shopify:section:load`, and unmounts on `shopify:section:unload`;
- remounts everything on `pageshow` from the back-forward cache.

## 3. Events

| Event | On | When |
|---|---|---|
| `kitenzo:bundle-added` | the widget root, bubbling | After the bundle's lines and `_bundles` are confirmed in the cart. `detail` has `bundleId` and the SDK's configure result. A theme with a cart drawer listens for it and refreshes. |

## 4. CSS custom properties

The section sets these on the mount element; the widget reads them with a fallback.

| Property | Set from |
|---|---|
| `--<px>-font-body`, `--<px>-font-heading` | the theme's `type_body_font` / `type_header_font` (names vary by theme) |
| `--<px>-accent`, `--<px>-accent-contrast` | colour settings |

## 5. The test contract

The conformance suite (`e2e/conformance.spec.ts` in every project) finds and drives the widget only through these. Put them on markup that already exists.

| Test id | On | Carries |
|---|---|---|
| `cc-root` | the widget's outermost element, in every state | `data-complete="true|false"` (the SDK's `isSatisfied`), `data-qa-count` (items picked) |
| `cc-loading` | the loading state | |
| `cc-error` | a load error or an unavailable bundle | a sentence, never a status code |
| `cc-editor-panel` | theme-editor-only diagnostics | |
| `cc-price` | the current total | `data-price-value="41.34"`, from the SDK's numbers, not parsed from text |
| `cc-compare-at` | the struck-through price before discount | `data-price-value` |
| `cc-saving` | the saving | `data-price-value` |
| `cc-add-to-cart` | every buy button (rail and mobile bar both) | `aria-disabled="true"` until the bundle can be bought |
| `cc-cart-error` | the cart's failure sentence | |
| `cc-mobile-bar` | the sticky mobile bar, if any | |
| `cc-dialog` | every overlay | must be a `<dialog>` |
| `cc-pick` | the control that adds one of a product | `disabled` only when sold out |

And on every product the widget renders, pickable or not:

| Attribute | Meaning |
|---|---|
| `data-cc-product="<handle>"` | the Shopify handle |
| `data-cc-unavailable="true"` | every variant is sold out (absent otherwise; never `"false"`) |
| `data-cc-quantity="<n>"` | how many of it are in the bundle |

A widget puts `cc-add-to-cart` on every surface that has one and lets CSS decide which is visible. It never mirrors a CSS breakpoint in JavaScript to decide where a test id goes.
