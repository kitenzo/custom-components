# Edge cases

Everything a real store has done to a custom component that we know about, how to reproduce it locally, and what the widget must do. Every row with a scenario can be switched on in any project's dev server with `?scenario=<id>` (several, comma separated) or from the dev toolbar; most also run in the conformance suite.

Check this list before debugging anything. Most "bugs" on a custom component are one of these.

## The catalogue

| Case | Reproduce | The widget must |
|---|---|---|
| Sold-out products, shown | default catalogue | Show them, marked, with every control disabled. Clicking one changes nothing. Their variants never reach `/configure` or `/cart/add.js`. |
| Sold-out products, hidden by the shop | `hide-sold-out` | Drop them, unless a step could no longer reach its minimum: then keep them, visibly unpickable. |
| Nothing in stock | `all-sold-out` | Say so. The buy button explains. Nothing is sent. |
| Low stock | `low-stock` | The builder stops at `maxOrderableQuantity` (`blockedReason` is `stock`): say "Only N left" / why the `+` stopped. |
| Archived or draft products left in a bundle | `archived-and-draft` | Never offer archived. Drafts follow `hideDraftProducts`. |
| Titles with apostrophes, quotes, markup, right-to-left script, 120 characters | `hostile-strings` | Render as text. Nothing executes. Nothing overflows. An apostrophe in a setting reaches the widget intact. |
| Limit rules no selection can meet (`gte 5` with `lte 3`) | `contradictory-rules` | Tell the merchant in the theme editor which rules clash; show shoppers a short neutral line. |
| A bundle with no products | `empty-bundle` | Say so, rather than an empty frame with a dead button. |
| A product option with one value | starter catalogue (Size: 1000ml) | Hide its dropdown. |
| A combination that does not exist, or is sold out | starter catalogue (vitamin shot sizes), [activewear-set](../examples/activewear-set/) | Disable the value, do not hide it. Option order is significance order: a change repairs only the options after it. |
| Several `eq` rules on one step ("6, 12 or 24") | [macaron-box](../examples/macaron-box/) | Offer only the valid counts; trust `isSatisfied`. |
| A required product in no step | starter catalogue | Show it as included and priced. The SDK counts it towards the bundle-wide count and adds it on submit. |
| A bundle-wide count with a required product ("exactly 4", 1 required) | unit test `selection.test.ts` | Count the required product, as the engine does: the shopper picks 3, not 4. |
| A rule that is not a count (one per product, multiples, a price or weight limit) | the "Selection not allowed" setting | The buy button still says why, in the merchant's words; the SDK's own detail goes to the theme editor. |
| An Edit link whose saved bundle has gone | e2e `an Edit link whose…` | No promise of a replacement; the add creates a new bundle. |
| The same bundle twice on one page | e2e two sections | Element ids unique per widget. |
| A sold-out required product | unit test `model.test.ts` | Keep it visible, hold the bundle off sale, say why. |
| Products with no photographs | [gift-box](../examples/gift-box/) | A designed placeholder, not a broken image. |
| A variant with its own photograph | [activewear-set](../examples/activewear-set/) | Use `variant.image`, falling back to the product's. |
| `image` and the gallery's first photo differ only by `?v=` | `model.ts` `photosOf` | Compare without the query string, or the gallery shows the same photo twice. |
| Personalisation the merchant made required | starter refuses it; [gift-box](../examples/gift-box/) collects it | Never sell an "engraved" item without the engraving. |
| A personalisation field with a fee | [gift-box](../examples/gift-box/) `?bundle=2005` | Show the fee before it is charged, add it to the total once the field is filled in (`useBundlePrice` with the same `properties`), and leave the fee's cart line to the SDK. |
| Conditions that hide steps or products | builder `conditions` | Hide them; a hidden step needs nothing. |
| Conditions the headless SDK cannot run (`conditionsPartial`) | `model.ts` | Warn the merchant in the theme editor. |

## The API

| Case | Reproduce | The widget must |
|---|---|---|
| Slow API | `slow-api` | Render its loading state inside the widget, at the widget's size. |
| API never answers | `loading-forever` | Stay in the loading state; never render half a builder. |
| Bundle unpublished or deleted (404) | `bundle-404` | "Not available", never "please refresh". |
| API error (500) | `api-500` | A sentence asking the shopper to try again; no status code. |
| Offline | `api-offline` | The same. |
| The shop's settings fail to load | `settings-error` | A sentence, not an endless loading state. (The provider fetches settings once and stays silent on failure; the starter asks again after a few seconds.) |
| No API key, or a key that is not `kit_live_`/`kit_test_` | e2e `a missing API key…` | A sentence, never a white screen. The SDK throws on a bad key in its constructor, so check it first; never substitute a placeholder key. |
| The key's allowed origins do not include the store | real store only | A 401/403: the theme editor says to check the key's allowed origins. |
| A draft bundle in the theme editor | `draft-bundle` | Preview it (the SDK reads drafts there on its own); refuse to add it to a cart, and tell the merchant to publish it. |

## The cart

| Case | Reproduce | The widget must |
|---|---|---|
| Shopify refuses a line (422) | `cart-422` | Show Shopify's own reason as a sentence. Never the URL, never "422". |
| Rate-limited (429) | `cart-429` | Ask the shopper to wait and try again. |
| Shopify error (500) | `cart-500` | A sentence. |
| Connection drops before the add | `cart-offline` | A sentence; the next press tries again. |
| The lines land, then the answer is lost | `cart-lost-response`, e2e `an answer lost…` | Hold the selection: the cart hook keeps the pending add and finishes it on the next press, reading the cart back first so nothing doubles. Letting the shopper change the bundle in between would add the old one while showing the new one. |
| A double press on the buy button | e2e `a double press…` | One bundle. |
| Another bundle already in the cart | e2e `merges _bundles…` | Merge `_bundles`, never replace it. |
| Two of the same bundle in one cart | e2e (gift-box) | Each instance keeps its own lines and its own shopper input. |
| The cart's "Edit" | toolbar, then the cart page's Edit link; e2e `basket Edit…` | Rebuild the bundle on first paint, replace the original on add, end with one bundle. |
| Edit of a bundle whose products changed since | `useBundleEdit().missing` | Restore what still exists and say what does not. |
| A store under a locale path (`/en-gb`) | e2e `keeps a locale prefix…` | Every cart route and the redirect keep the prefix. |
| A theme with a cart drawer | the "After adding" setting | Stay on the page and fire `kitenzo:bundle-added` for the drawer. |

## A/B tests

| Case | Reproduce | The widget must |
|---|---|---|
| A shopper in a running test who stays on this bundle | `ab-stays` | Render as ever. One impression once the bundle is on screen, and `_ab_test_routed` on every cart line. `useBundle` and the cart hook do both. |
| A shopper assigned the other variant | `ab-other-variant` | Keep the loading state and go to the variant's page with the page's query. Nothing is counted for this bundle. |
| The merchant previewing from the admin | `ab-stays` with `?ab_bypass=true` | Nothing counted, nothing credited. The SDK reads the parameter itself. |

## Markets

| Case | Reproduce | The widget must |
|---|---|---|
| A shopper in another currency | `market-eur` | Every amount in EUR, matching checkout. No £ anywhere. |
| A zero-decimal currency | `market-jpy` | "¥1,250", never "¥1,250.00". |
| Prices hidden by the merchant | `hidePrices` setting | No amount anywhere: cards, summary, mobile bar. |

## The theme

| Case | Reproduce | The widget must |
|---|---|---|
| A hostile theme: transformed ancestors, colliding class names, bare `button`/`select`/`img` rules, painted colours | `?theme=hostile` (the e2e suite always runs under it) | Look and work the same. |
| An ancestor with `transform` or `container-type` | hostile theme | Overlays are `<dialog>` in the top layer; no `position: fixed`. |
| Two sections on one page | toolbar "Two sections", e2e | Two widgets, each mounted once, each with its own settings. |
| The theme editor re-rendering a section | toolbar "reload section", e2e | Remount; never go blank. |
| Back from the cart (back-forward cache) | `pageshow` in `embed.tsx` | Remount, so "Added" does not invite a second add. |
| A theme that scrolls an inner wrapper and locks `body` | keep hidden inputs in a positioned row | Clicking a hidden radio must not scroll the locked page. |
| A sticky theme header | dev page header | Scroll targets clear it (`scroll-margin-top`). |
| A theme's own lazy-load scripts withholding yours | real store only | If the widget is missing on a real theme but fine locally, look at the theme's script loading first, from a non-Linux browser. |
| A narrow product-page column | [volume-ladder](../examples/volume-ladder/) | Container queries: adapt to the width given, not the viewport. |

## Real-store-only checks

Some things only a real store shows. Before calling a component ready:

- Load it on the merchant's actual theme, in the theme editor (a bare `shopifypreview.com` link cannot see a draft bundle).
- Go all the way to checkout: the bundle groups, the discount applies, the cart's "View details" shows the contents.
- Where the shopper gives input or subscribes, place a test order and read the **Shopify order's** line properties and the email that was sent. The thank-you page is not proof.
- After every upload, confirm the live theme serves your new build (the asset's `?v=` changed and the bytes match).
