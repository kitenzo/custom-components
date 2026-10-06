# Best practices

Every rule here was paid for by a real build on a real merchant's store. Each comes with what went wrong when it was broken. The starter already follows all of them; this page is for knowing why, so you keep them when you change it.

## The engine

**1. Never reimplement the engine.** Selection, validation, pricing, discounts and cart choreography come from the SDK. A widget that computes its own total disagrees with checkout the first time the merchant uses a tier, a surcharge or a market. A widget that builds its own cart lines silently drops Kitenzo's A/B test attribution, and the merchant's test never concludes.

**2. Gate the buy button on `isSatisfied`.** It reads the bundle's real rules, required products included, and is exactly what `/configure` will accept. Never gate on "every step has a pick": that stays false forever on a "pick any 6 across steps" bundle and on a step whose only rule is a maximum. Say why it is false from the builder's `progress` (how many are still missing, per step and bundle-wide) and `problems` (every other rule), and gate a wizard's "Next" on `isSectionValid`.

**3. Read counts from the SDK.** The offer carries each step's window and the bundle's (`getBundleOffer(...).sections[].limits` and `.bundleLimits`; `getSectionLimits` and `getBundleLimits` are the same windows without an offer), translated from all five operators (`gt 3` is a minimum of 4). There is no `min`/`max` field on a step: the limit rules are the min and max. A widget that read "no field" as "no limit" rendered a required step as optional. A window with no ceiling has `max: null`: compare through `ceilingOf(limits)`, and ask the builder's `blockedReason` whether one more fits.

**4. Several `eq` rules are alternatives.** "6, 12 or 24" is three `eq` rules. The window reads 6 to 24, but 7 is not valid. Draw the choices from the window's `allowedCounts` (`[6, 12, 24]`), and let `isSatisfied` decide.

**5. Invent nothing.** Every constraint comes from the bundle, the approved design, or a merchant's explicit request. No step is compulsory because it has no rule. Nothing is preselected. Merchants have asked "the bags are optional, right? Why do I have to pick one?" and "which of these rules did we actually ask for?" about widgets that guessed.

**6. Be as generic as the design allows.** Render any number of steps and required products, zero included. When a feature's prerequisite is missing (no tiers for a ladder, no second step for a card), leave out that feature and render the rest. If the design genuinely cannot draw a shape (it needs exactly two steps), refuse that bundle, but say so twice: in the section settings ("What this needs: …") and as a clear explanation in the theme editor.

**7. Archived products are never offered. Drafts follow the shop's setting.** `getBundleOffer` (`useBundleOffer`) decides which products each step shows: render what it returns, and never filter `bundle.sections` yourself. Its `issues` say what the merchant has to fix, for the theme editor, and `isSellable` whether anything can be bought.

**8. Sold out follows the shop's setting, with one exception.** With "hide out of stock" on, the offer leaves sold-out products out, unless the picks that are owed could not be made without them: then it keeps them, and the widget shows them visibly unpickable. "Sold out" is `isVariantBuyable(variant)`, never `available` alone. Every button on a sold-out card is disabled, including the one in its details dialog. (Three separate widgets let shoppers add a sold-out product from a drawer or quick view the card had correctly disabled.)

**9. The builder decides whether one more fits.** It takes only what fits: a step's and the bundle's maximums, a cap on one product or variant, and orderable stock (`maxOrderableQuantity`, never `inventoryQuantity`, which can be zero or negative on a variant that sells freely). Disable a control on `blockedReason(stepId, variantId)`, replace a pick in a full step with `swapItem`, and never count room yourself: a widget that counted from a subset of the rules built selections the cart then refused whole.

**10. Required products are part of the set.** Show them, price them in, carry them at the merchant's quantity. A sold-out required product stays visible even when sold-out products are hidden, and the bundle is held off sale with a sentence saying why. Hiding it while still sending it to the cart sold sets the merchant could not pack.

**11. Seed the builder when you create it, never from an effect.** A basket Edit, a quiz result or a product page that opens with four of a flavour creates the builder with those picks (`initialSelections`), and the builder keeps only what still fits. Seeding from `useEffect` paints an empty bundle for one frame, and a fast tap lands in the wrong state.

**12. Data needed at first paint gates the builder's existence.** Wait for the shop's settings before deciding what to offer. Mounting first and patching later locked one widget's option dropdowns into the wrong values.

## Money and markets

**13. Every amount is in the shopper's currency, formatted one way.** Pass the theme's country to the provider, format every amount besides the total with `useMoney` (the same currency and format as `useBundlePrice`), and read `data-price-value` from numbers (`useBundlePrice().amounts`), not from formatted text. JPY has no decimals.

**14. Never hardcode a currency, a market or a route.** A section shipped with `data-country-code="GB"` showed pounds to every shopper in Europe. A cart redirect to `/cart` dropped shoppers out of `/de/`.

**15. Never ask the merchant to type a money amount into a setting.** "Free shipping over (£)" broke the moment the store sold in euros.

**16. When the merchant hides prices, no amount appears anywhere**: not on a card, not in the summary, not in the mobile bar. One widget leaked a total in the mobile bar.

## What the shopper sees

**17. Every disabled control says why.** Step full, bundle full, stock reached, a cap on one product or variant, sold out, something still missing: every reason `blockedReason` can give has a sentence of the merchant's. A `+` that just goes grey ("I have no idea why") is a bug. A control that must explain itself on tap uses `aria-disabled="true"` and refuses in its handler; `disabled` swallows the tap.

**18. Cart errors are sentences.** Render the cart hook's `shopperMessage`. Never `error.message`: it carries the route and the status, and shoppers have been shown "/en-gb/cart/add.js responded 422" and, on another store, the literal text "422".

**19. An unpublished bundle is unavailable, not broken.** A 404 gets neutral copy ("This bundle is not available right now"). "Please refresh the page" is for real failures only: it cannot fix a merchant's choice.

**20. Loading and errors render inside the widget.** At the size the widget will be, so nothing jumps. Never a blank space.

**21. Icons are inline SVG.** An emoji rendered as an empty box in one theme's font.

**22. Product descriptions are text.** Convert `descriptionHtml` with `htmlToPlainText`. Merchant HTML in a card is markup you did not write.

**23. Look up the product a dialog shows on every render, by id.** A product captured when the dialog opened goes stale when stock or prices change.

## What the merchant controls

**24. Every visible string is a setting**, with the same default in the Liquid schema and the widget (a test checks). Read settings defensively: blank text means the default; a malformed field is ignored on its own, never the whole blob; a cleared number means "unset", not 0 (in Liquid, `'' | times: 1` is 0).

**25. The theme editor explains; the storefront stays short.** When `Shopify.designMode` is set, show the merchant exactly what is wrong and how to fix it. A reason that only reaches `console.warn` reaches nobody.

**26. Every component has the "Bundle source" dropdown**, first, defaulting to "This product". One template serves every bundle; a new bundle needs no code. A merchant whose guide named the template after one bundle asked for a dropdown they already had.

**27. Schema hygiene.** No dev-only settings (no API base URL). Every declared setting is read. Generic names ("Option 1 label", not "Box size 1"). Every `info` under 500 characters and the section name at most 25: Shopify rejects the upload and nothing local catches it (the starter's `test/theme.test.ts` does). Shopify's Theme Check (`bash scripts/theme-check.sh`) warns past 40 settings: a copy-heavy component can pass it, but every extra setting is one more thing a merchant scrolls past, so group related copy and drop strings no shopper sees.

**28. Decide how shopper input reaches the order before you build it.** A gift message, an engraving, a delivery date: each needs a route into the order the merchant packs, that still works with two bundles in one basket. One build put the card message on a separate line, and an order with two gift boxes arrived with two messages nobody could match to a box. See [examples/gift-box](../examples/gift-box/).

## Surviving the theme

**29. Prefix every class and custom property.** Themes have their own `.drawer`, `.card`, `.modal`, `.hidden`. One theme's cart drawer CSS pushed a widget's quick view 576px off screen purely by class name.

**30. Reset form controls under the widget root.** Prefixes do not stop bare element rules: one theme ships `button { padding: 1em 25px }`, which pushed a stepper's `+` out of its box. The reset goes before every component rule, at the lowest specificity that works.

**31. Restore colour inheritance under the root.** One theme paints every element (`*:not(a, h1, …) { color: … }`), which turned text black on a dark surface.

**32. Overlays are native `<dialog>` opened with `showModal()`.** `position: fixed` is trapped by any ancestor with `transform` or `container-type`, and real themes have both. The top layer is not. Portals alone did not help.

**33. Do not rely on the `hidden` attribute** on an element whose class sets `display`: the class wins. Add `[hidden] { display: none !important }` under the root.

**34. Keep visually hidden inputs inside a positioned row.** One theme locks `html, body` and scrolls an inner wrapper; an absolutely positioned input that escaped it scrolled the locked page and froze it.

**35. Fonts come from the theme.** The section loads the theme's own faces with `font_face` and hands their names to the widget. Naming a font and hoping the theme loaded it is how a widget rendered in the system font. A custom font only when explicitly requested, as its own asset, never inlined into the CSS (inlined faces made one widget's CSS 118 KB and render-blocking).

**36. Two sections, two copies of the script.** Every section includes the script, so module-level state exists once per copy. Keep the mount registry on `window`, or the second copy mounts the first section again. (The DOM looks fine; every request goes out twice. Count requests, not elements, to test it.)

**37. Answer the theme editor's section events and the back-forward cache.** Without `shopify:section:load` the preview goes blank after every settings change. Without `pageshow`, a shopper returning from the cart sees "Added" and adds the bundle again.

## The cart

**38. Use `useBundleAjaxCart`.** It merges `_bundles` instead of replacing it (replacing drops the discount on every bundle already in the cart), writes attributes only after the lines land, throws on a non-2xx response (a bare `fetch` resolves on a 422), and reports success only once `_bundles` is confirmed.

**39. Answer the cart's "Edit".** The cart links Edit to the bundle's page with `?edit=…`. Read it with `useBundleEdit`, seed the builder from its `selections` (and a personalisation form from its `properties`), and pass `replace` to the cart hook so the edited bundle replaces the original. A widget that ignores it shows an empty builder, and adding again leaves two bundles in the cart.

**40. Be ready for A/B testing.** `useBundle` redirects shoppers in a Kitenzo A/B test to their variant's page and records the view. Load bundles only through `useBundle`, keep rendering the loading state while it is loading (a redirect will look like loading), render one bundle per page, and set the bundle's page in Kitenzo to the page the section is on.

## Accessibility

**41. Keep focus where the shopper is.** When "Add" turns into a stepper, or a removed line takes its button with it, move focus to the control that replaced it. Otherwise a keyboard or screen-reader user is dropped to the top of the page after every pick.

**42. Name a control for what it does now.** A sold-out product's button says "sold out" in its accessible name, not "Add". A visible badge inside a differently labelled button is never read.

**43. Live regions exist before their text.** Keep the status and the error region in the page at all times and change only their text. An element that becomes an alert in the same render as its message is often not announced.

## Proving it

**44. Test the built asset, on a hostile theme, on a phone.** The two files you ship are what you test, mounted the way Liquid mounts them, under the worst CSS real themes ship (`dev/hostile.css`). Mobile means WebKit: Chromium at 390px is not a phone.

**45. A test that cannot fail proves nothing.** Break the code, watch the test go red, restore it. Patterns that look like tests and are not: a forced click on a disabled button (it dispatches nothing), "nothing was sent" with no positive control, asserting only the last of several random draws, and rendering only in one market at `/`.

**46. Never hand-write API data.** A hand-written stub served a shape the API had never emitted, and every test passed against it. The mock backend here serves the serializer's exact wire format, checked by `test/wire-shape.test.ts`.

**47. Look at it.** Suites prove behaviour, not design. Screenshot at 1440 and 390, in every state (empty, part-filled, complete, dialog open, each error), next to the approved design, and close every difference.

## Process

**48. Recon before code.** Read the merchant's real catalogue (`/products.json` is public on every Shopify store): their real option names, prices and handles. One design assumed options called Loft/Hand/Flex/Length; the catalogue said Hand/Loft/Shaft.

**49. SDK gaps become issues, not workarounds.** If the SDK cannot do something, leave the feature out and raise it. Every build that patched around the SDK turned into a chain of version bumps found late on a live store. The one exception is handing the SDK data it should have had, isolated in a `src/sdkFixes.ts` with a test that fails the day it is not needed.

**50. Never ship `.env`.** Vite writes any `import.meta.env.VITE_*` it can see into the build as plain text. Read env values only behind `import.meta.env.DEV`, or a developer's own API key and base URL ship inside every merchant's theme.

**51. Confirm the live theme serves your build.** After an upload, check the asset's `?v=` changed and the bytes match `dist-embed/`. A cart once showed empty bundle contents because the live theme was still running a build from before the fix, which had gone to a different theme.
