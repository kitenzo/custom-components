# Working with the SDK

The SDK (`@kitenzo/core` and `@kitenzo/react`) owns selection, validation, pricing and the cart. This page is about the line between that and the widget: what stays the widget's job, with the example that shows how, and behaviour worth knowing before it surprises you.

If the SDK seems wrong, raise it with Kitenzo, with what you saw and the smallest reproduction. A widget never patches engine logic. At most it hands the SDK data it should have had, isolated in a `src/sdkFixes.ts` with a test that fails the day the fix is not needed. No project in this repo carries such a fix.

## What the widget owns

Everything here is presentation built on the SDK's own answers. None of it re-decides what the SDK decided.

### The shape of the design

- **A size the shopper chooses first.** With "6, 12 or 24" the builder is satisfied at 6 and will take a seventh; it does not know the shopper is filling a box of 12. A design that asks for the size first holds the shopper to it. [macaron-box](../examples/macaron-box/) keeps the chosen size and its own "box full" on top of `blockedReason`.
- **Marking every step of a wizard.** The builder says whether the current step is valid (`isSectionValid`). For every step at once, read `progress.sections[id].missing === 0`, as [skincare-routine](../examples/skincare-routine/) does.
- **Which products stand for a price that is not the shopper's.** `getBundlePrice` prices any selection; which sample box prices "a box of 12", or which pouch a ladder rung is quoted for, is the design's choice. See [macaron-box](../examples/macaron-box/) and [volume-ladder](../examples/volume-ladder/).

### Words

- **How a discount reads.** The SDK gives a ladder's rungs and amounts (`getDiscountLadder`) and the merchant's own "reach the next tier" sentence (`getDiscountTierText`). "10% off" or "£5 off" is the widget's wording. [volume-ladder](../examples/volume-ladder/) and [cocktail-case](../examples/cocktail-case/) draw one row per tier (the count just past an "exactly N" tier is a rung too, but not a row) and tell the merchant, in the theme editor, about a tier the ladder leaves out.
- **How a frequency reads.** "Every 2 weeks" needs plural rules a word list cannot carry, so pass your own through `recurringLabels.formatFrequency`, as [cocktail-case](../examples/cocktail-case/) does.
- **Every sentence a shopper sees.** The builder, the cart flows and the recurring plan each take `messages`, keyed by code, and speak English until you pass them. Every project words the cart's failures from theme settings (`cartMessages` in `src/content.ts`). The store's own reason for refusing a line (a 422's `description`, "sold out") is shown as the store sent it.

### Input

- **Uploading an image.** An image field takes a web address; hosting the image is the widget's. [gift-box](../examples/gift-box/) has no upload in its design, so it leaves an optional image field out, with a note in the theme editor, and holds a bundle that requires one off sale.
- **Holding an answer that is too long.** `personalisationFieldProblems` reports it (`too-long`, with how many over); showing "shorten by 3" and holding the button is the form's. [gift-box](../examples/gift-box/) counts as the SDK does, in UTF-16 units, so an emoji counts as 2.

### Without React

- **Loading settings with a retry.** `useSettingsState` is React's. [vanilla-core](../examples/vanilla-core/) retries `client.getSettings()` itself, so a failed request ends in a sentence.
- **Two calls for A/B testing.** A React component gets A/B tests through `useBundle`. On `@kitenzo/core` alone, call `followABTestRedirect(bundle)` after `client.getBundle()`, and `client.recordImpression(bundle.id, bundle.abTestVisitorId)` once a bundle with `abTestRouted` set is on screen. The cart flow marks the lines either way. See [vanilla-core](../examples/vanilla-core/); the mock backend serves a test in the `ab-stays` and `ab-other-variant` scenarios.

## Behaviour to know about

- **Several `eq` rules are alternatives.** "6, 12 or 24" reports a window of 6 to 24 with `allowedCounts: [6, 12, 24]`. Draw sizes from `allowedCounts`, which lists only counts that also fit under the bundle-wide maximum, and let `isSatisfied` decide validity. `progress.missing` aims for the next allowed count. A bundle-wide count includes the required products the SDK adds on submit: "exactly 7" with one required product is six picks (`requiredQuantity`).
- **No ceiling is `max: null`.** Compare through `ceilingOf(limits)`; `count >= null` is true in plain JavaScript.
- **The builder only takes what fits.** `addItem` returns how many went in. Adding the new pick and then removing the old one does not replace a pick in a full step: use `swapItem`, which returns whether the swap happened. `blockedReason` answers for one more item beside the pick that is there; for a replacement ask `swapBlockedReason(stepId, from, to)`.
- **`useBundlePrice` before any pick** returns nulls, except for a flat set price, which it can show up front; `amounts` is null there, so read the number from `discountedPrice`. `hasDiscount` is true only when the price is below the original.
- **One call prices any selection.** `getBundlePrice(bundle, selections, { settings, locale })` returns what `useBundlePrice` returns, without React and for a selection the shopper has not made, in the shopper's currency. `calculatePrice` alone answers in the shop's currency.
- **The theme cart never reports `cart-busy` or `hasMissingItems`.** Those are Storefront API signals: the theme's `/cart/add.js` adds every line or answers 422.
- **Personalisation is for native bundles.** `takesLineProperties(bundle)` says whether a bundle carries line item properties at all. The cart flows refuse a native bundle while a required field has no answer (`personalisation-required`), before any request. What is sent is cut at a field's character limit, never inside a character. The cart's record of a box (`_kitenzo_properties`, which Shopify copies to the order) holds only answers that landed on a line. A field's `fee` is sent for a native bundle only, by the API and by the mock backend alike.
