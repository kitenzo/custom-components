# Known SDK issues

Problems in the published SDK that a custom component has to live with today, what this repo does about each, and how you will know it is fixed. The rule for working around them is strict: a widget may hand the SDK data it should have had, isolated in `src/sdkFixes.ts` with a test that fails the day the fix is no longer needed. It never patches engine logic.

## Required products block `isSatisfied` (`@kitenzo/core` 0.9.0)

**What happens.** A bundle with a required product that is not also in one of its steps can never be added to the cart: `isSatisfied` stays `false` whatever the shopper picks, and the builder's `errors` say "Unknown product requires 1 item(s), got 0". A basket Edit of such a bundle also reports the required product as missing.

**Why.** The API serialises a required product with `variantIds: []`, meaning "any variant". The builder's required-product check resolves an empty list by looking for the product among the bundle's steps, finds nothing, and counts zero, even though the SDK itself adds the required product to the configuration.

**What this repo does.** `withRequiredVariantIds` in `src/sdkFixes.ts` fills `variantIds` from the product the SDK already merged onto the entry, before the bundle reaches the builder. `test/sdkFixes.test.ts` asserts the SDK still needs it; when that test fails, delete the fix.

## No line item properties through the cart hook (`@kitenzo/react` 0.9.0)

**What happens.** `useBundleAjaxCart().addToCart(bundle, selections, options)` has no way to attach line item properties, so personalisation answers and gift messages cannot ride on the bundle's lines through it.

**What this repo does.** [examples/gift-box](../examples/gift-box/) uses the hook's own `fetchImpl` option, documented for "a store-specific wrapper", to add properties to the `/cart/add.js` request, and keeps every other guarantee the hook gives (sequencing, the `_bundles` merge, Edit replacement, shopper-safe errors).

## Gaps the examples ran into

Not bugs, but things a custom component cannot do through the SDK today, found while building the examples. Each example's README says what it does instead.

- **Basket Edit cannot restore shopper input.** `useBundleEdit` and `selectionsFromSaved` restore the products, not the engraving or message typed for them, even though the cart lines still carry it. [gift-box](../examples/gift-box/) asks the shopper to type it again.
- **Personalisation image fields and fields with a fee** have no supported path through the cart hook. [gift-box](../examples/gift-box/) holds a bundle that requires one off sale, with an explanation in the theme editor.
- **Recurring bundles wording is English only.** `useRecurringPlan().errors` and `formatRecurringFrequency` are hardcoded English; [cocktail-case](../examples/cocktail-case/) maps errors by `type` to theme strings and passes the theme's wording through `recurringLabels`.
- **No helper turns discount tiers into a ladder** ("2 for 10% off, 3 for 15%"), and `@kitenzo/react` does not re-export `calculatePriceWithConditions`, so pricing a selection the shopper has not made needs `@kitenzo/core` directly. See [volume-ladder](../examples/volume-ladder/) and [macaron-box](../examples/macaron-box/).
- **`getSectionLimits` cannot express alternatives** ("6, 12 or 24" reads as 6 to 24). [macaron-box](../examples/macaron-box/) reads the `eq` rules itself to draw its box sizes.
- **No framework-free cart flow.** Core's `addBundleToCart` does the sequence but not the state around it (phases, one add at a time, recovering from a lost answer). [vanilla-core](../examples/vanilla-core/) writes that state itself, in about 150 lines.
- **The theme-cart hook reports less than the Hydrogen one.** In 0.9.0 `useBundleAjaxCart` never reports `cart-busy` and always sets `hasMissingItems: false`; those signals are Storefront API only.

## Behaviour to know about (not bugs)

- **`getSectionLimits` on alternatives.** Several `eq` rules report as one window (6, 12 or 24 reads as 6 to 24). Use the window for "is the step full", and `isSatisfied` for "is this valid".
- **`UNBOUNDED` is `Infinity`**, and `JSON.stringify(Infinity)` is `null`. Never send a limits object across a server boundary.
- **`useBundlePrice` before any pick** returns nulls, except for a flat set price, which it can show up front.
- **A/B testing is not in the published SDK yet.** 0.9.0's `useBundle` is a plain fetch. Kitenzo's A/B support (the redirect to a shopper's assigned variant and the impression count in `useBundle`, attribution on the cart lines in core) is merged for the next release. A component that loads through `useBundle` and adds through the cart hook picks it up with a version bump; one on `@kitenzo/core` alone will need two calls added (see [examples/vanilla-core](../examples/vanilla-core/)).
