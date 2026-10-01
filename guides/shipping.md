# Shipping a custom component

## The install kit

```bash
bun run package:embed
```

builds the asset and writes `dist-embed/kitenzo-<slug>-embed.zip`:

```
kitenzo-<slug>-embed/
  assets/kitenzo-<slug>.js
  assets/kitenzo-<slug>.css
  sections/kitenzo-<slug>.liquid
  INSTALL.md            from theme/README.md
  MERCHANT-SETUP.md
```

The folders map onto the theme's own. That zip is everything a merchant, or their developer, installs. Source never needs to go to the store.

## Kitenzo-side setup

Before the section can show anything, on the merchant's store:

1. **Headless is enabled.** It is invite-only in the beta; support@kitenzo.com enables it.
2. **An API key** from Kitenzo's **Settings > Headless**, with **allowed origins** listing every domain the store is served on. The key ships in the page source (as every storefront key does), so the origins are what stop another site using it. Never create an originless key for production.
3. **The bundle**, with its steps, limits, required products and discount, built in Kitenzo as usual.
4. **The bundle's page** set, in its Kitenzo settings, to the page the section is on. A/B tests and the cart's Edit link both send shoppers there.
5. **Nothing else discounts the same products**, or the discounts stack.

## Installing on the theme

The kit's `INSTALL.md` walks a merchant through it. In short: upload the two assets and the section to a copy of the live theme, create one product template (say `product.kitenzo-bundle`) with the section on it set to "This product", and assign each bundle's product to that template. A new bundle later is one more assignment: no new template, no code.

## Before you call it ready

- [ ] `bun run verify` green: typecheck, unit tests, the conformance suite at desktop and mobile.
- [ ] Screenshots at 1440 and 390 match the approved design in every state.
- [ ] Every bundle shape the merchant has, and a few they might: one step and several, no rules, a minimum only, a maximum only, a range, alternatives, tiers, a set price, required products, products with and without options.
- [ ] All three bundle sources work: "This product" on two different bundle products, "Selected bundle", and a draft by its ID.
- [ ] Every merchant request maps to a setting the merchant can change and see change in the theme editor.
- [ ] On the merchant's real theme, in the theme editor: the header clears, the fonts are the theme's, nothing collides.
- [ ] Through to checkout: the discount applies, the cart shows the bundle's contents, an Edit round trip leaves one bundle.
- [ ] A test order where the shopper gives input or subscribes, with the Shopify order's line properties read.
- [ ] The live theme serves the new build (`?v=` changed, bytes match `dist-embed/`).

## Updating

Change, `bun run verify`, `bun run package:embed`, re-upload the two assets (and the section, if its schema changed). Never rename a shipped section's file or its setting ids: the merchant's templates point at them, and the section would drop off their pages.

Keep `@kitenzo/react` on the latest published version: on `0.x`, a caret range never crosses a minor version, so an old pin never picks up the fixes other stores rely on.
