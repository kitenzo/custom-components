# Macaron Box

A "build your own box" where the box is the interface: the shopper picks a box size, then fills a tray of slots with real macaron photographs, one slot at a time.

![The box of 12, filled, on desktop](docs/screenshots/desktop.png)

<p>
  <img src="docs/screenshots/mobile.png" alt="The same box on a phone, with the tray as a strip in the sticky bar" width="260">
  <img src="docs/screenshots/mobile-switch.png" alt="Switching to a smaller box asks before it takes anything out" width="260">
  <img src="docs/screenshots/mobile-dialog.png" alt="A flavour's details, with its six photographs" width="260">
</p>

It is a [Kitenzo](https://kitenzo.com) custom component: a React widget on the published `@kitenzo/react` SDK that ships to a Shopify theme as one JS file, one CSS file and a Liquid section. Kitenzo's engine owns selection, validation, pricing and the cart; this widget owns how the box looks and feels.

## What it shows

- **Box sizes read from the bundle, never typed in.** Several "equal to" count rules on one step (6, 12, 24) are alternatives. The SDK reports them as `allowedCounts` on the step's limits (`[6, 12, 24]`, beside the 6 to 24 window), and `src/box.ts` draws one card per count. A bundle of 4 or 8 draws two cards. A bundle with no "equal to" rules has no `allowedCounts`, and the widget renders without the size chooser.
- **Prices from the SDK.** Each card shows the box's price, the price before the discount and the price per macaron, computed by the SDK's `getBundlePrice` on sample boxes of that size, so a card always matches the total the cart will charge, in any currency. When what goes in changes what the box costs (flavours priced apart under a percentage, or a flavour with a surcharge on top of a set price), the samples disagree, the card reads "From" the lowest, and in a set-price box the flavour says what it adds ("+£0.50").
- **A tray that fills in pick order.** One slot per macaron, filled with that flavour's photograph in the order the shopper chose. Tap a filled slot to take that macaron out: that slot empties, not the newest of its flavour.
- **No silent drops.** Switching to a smaller box than the tray holds opens a dialog that says how many would come out (the most recent) and lets the shopper keep their box instead.
- **"Fill the rest for me".** A pure, seeded planner (`src/autofill.ts`) fills only the empty slots and spreads them across flavours. It never works out for itself whether a flavour can take one more: it plans on a builder of its own (`createBundleBuilder`, opened with what the box holds) and keeps a macaron only when that builder's `addItem` took it, so it keeps to sold out, stock, "at most 2 of each" and every other rule the builder holds. The plan is applied one `addItem` at a time.
- **The buy button waits for the box the shopper chose.** Six macarons is a valid box to the engine, but not when the shopper is filling a box of 12. The button needs the SDK's `isSatisfied` and a full box. The chosen box is the one thing this widget holds itself: the SDK stops a step at its largest allowed count and cannot be told to aim for a smaller one (see "What the SDK leaves to this widget").
- **Desktop and phone.** On desktop the tray sits in a sticky rail beside the flavours. On a phone it shrinks to a strip of dots in the sticky bar, which scrolls to the full tray when tapped.

## The bundle it expects

One step whose limit rules are several **Total number of products = N** rules, one per box size, and (optionally) a **tiered, set-price** discount with one "at least N" tier per size, its operator `max`. The demo bundle (`dev/catalog.ts`, id 2001):

| | |
|---|---|
| Step | "Choose your macarons": Vanilla, Chocolate, Pistachio, Mocha, Lemon, Rose, English Toffee, Lavender, Orange, Raspberry (real products and photographs from the Kitenzo demo store) |
| Count rules | `eq 6`, `eq 12`, `eq 24` |
| Discount | set price per tier: 6 for £6.50, 12 for £12.00, 24 for £22.00, operator `max` |
| Stock | Rose has 4 left; Lavender is sold out |

Why `max`: every tier is "at least N", so a box of 24 meets all three. `max` charges the largest tier value, £22.00, which is right because a bigger box always costs more in total. `cumulative` would add the tiers and charge £40.50. `test/sdk-contract.test.ts` proves both against the SDK.

Other shapes it handles:

- **Any number of sizes** (`?bundle=2002` is a box of 4 or 8 at its own set prices).
- **No sizes at all** (`?bundle=2003` is "any 6 to 12" at 10% off): no size chooser, a tray of 12 slots, buyable from 6.
- **Bundle-wide `eq` rules** on a single-step bundle are sizes too, less what every box includes: "exactly 7" with one required product is a box of 6. A size another rule of the same scope rules out (an `eq 24` beside an `lte 12`) is not in `allowedCounts`, so it is not offered.
- **Percentage or money-off discounts**: the cards say "From" the cheapest box when flavours cost different amounts, and each flavour shows its own price.
- **Surcharges** (`?bundle=2004` is the demo box with £0.50 on pistachio): the SDK adds a flavour's surcharge on top of the set price, so the cards say "From" and pistachio says "+£0.50".
- **More steps** render as plain flavour grids after the box, with their picks listed under the tray. **Required products** are listed as "Included".

It refuses (with a sentence for the shopper and the reason for the merchant in the theme editor) what every Kitenzo custom component refuses: rules that contradict each other, a box step with nothing in stock, a sold-out required product, and required personalisation it cannot collect.

## Edge cases, and where to see them

Run the dev server and add `?scenario=<id>` (comma-separate several), or use the dev toolbar.

| Edge case | How to see it |
|---|---|
| Sizes from the rules, not the code | default; `?bundle=2002` (two sizes); `?bundle=2003` (no size chooser) |
| Several `eq` rules are alternatives: 7 is inside the 6 to 24 window but is no box | add 7 to a box of 12: the button stays refused until the box is full |
| A flavour with little stock stops at its stock and says why | default (Rose, 4 left); `?scenario=low-stock` (Vanilla, 2 left) |
| "Only 4 left" from the merchant's threshold down | default (Rose); the section's **Low stock from** setting, 0 to never say it |
| A flavour that adds to a set price: "From" on each size, "+£0.50" on the flavour | `?bundle=2004` |
| A step or flavour the conditions engine hides leaves the page, the tray's choices and "Fill the rest" | a bundle with conditions; `test/model.test.ts` |
| A sold-out flavour is shown and unpickable, or hidden | default (Lavender); `?scenario=hide-sold-out` |
| "Fill the rest" routes around sold-out and capped flavours | choose 12, add 3 Rose, press "Fill the rest for me" |
| Nothing can be sold | `?scenario=all-sold-out`, with `theme-editor` for the merchant's explanation |
| A smaller box asks before dropping picks | fill 9 of a box of 12, then choose the box of 6 |
| Prices in the shopper's currency | `?scenario=market-eur`, `?scenario=market-jpy` |
| Cart refusals as sentences | `?scenario=cart-422`, `cart-429`, `cart-500`, `cart-offline` |
| Basket Edit reopens the box it was bought in | add a box, then use the "Edit bundle" link on `/cart` |
| Bundle unpublished, API down, slow, never answers | `bundle-404`, `api-500`, `api-offline`, `slow-api`, `loading-forever` |
| Archived and draft products, hostile strings, contradictory rules, an empty bundle, a draft bundle | `archived-and-draft`, `hostile-strings`, `contradictory-rules`, `empty-bundle`, `draft-bundle` |
| A hostile theme (transformed ancestors, bare `button` rules, colliding class names) | `?theme=hostile`; the e2e suite runs every test under it |

## Run it

```bash
bun install
bun run dev                          # http://localhost:5181
bun run verify                       # typecheck, unit tests, theme asset build, e2e (desktop Chromium, iPhone 14 WebKit)
bun run screenshots                  # regenerate docs/screenshots (dev server running)
bun run package:embed                # the zip a merchant installs: assets, section, install guide
```

Install on a store with `theme/README.md` (the install guide) and `MERCHANT-SETUP.md` (what to set up in Kitenzo).

## How it works

- `src/model.ts`: the SDK's offer (`getBundleOffer`, with the builder's `conditions`) as steps, flavours and what the merchant has to fix; `byVariantId` turns a pick back into its flavour.
- `src/box.ts`: the box as data. `boxSizes` takes the sizes from the SDK's `allowedCounts`; `boxOffers` prices each size with the SDK's price engine and its market localisation, on one sample box per distinct flavour price and surcharge, and says whether the price is exact; `flavourPricing` says whether a flavour shows its price, only its surcharge, or nothing; `reconcileOrder` keeps the pick order beside the builder's quantities; `overflowOf` says which picks a smaller box would drop and `selectionsOf` turns what is left back into quantities; `trayColumns` lays a tray out in full rows.
- `src/autofill.ts`: `planFill` and its seeded random source. Pure, so `test/autofill.test.ts` pins an exact plan to a seed and checks every planned macaron against a real builder.
- `src/selection.ts`: what the builder's `progress` means for the page (`missingPicks`, `isStepDone`, `isStepFinished`), `box-full` as the one reason of this widget's own that one more cannot go in (`blockedInBox`), and `usePickOrder`: the pick order as state beside the builder (`place`, `removeAt`, `shrinkTo`).
- `src/ui/Builder.tsx`: owns `useBundleBuilder` and the model, the chosen size, the switch confirmation, "Fill the rest", and the buy gate (`isSatisfied` and a full box).
- `src/ui/context.ts`: two contexts. `useBuilder()` is what stays the same while the shopper picks (the model, money, copy, the box on offer, the builder's methods); `useSelection()` is the snapshot (selections, progress, the pick order, the chosen size). A card is memoised, so a render that changes neither draws none.
- `src/ui/copy.ts`: `blockedText`, a sentence of the merchant's for every reason one more will not go in.
- `src/ui/SizeChooser.tsx`, `src/ui/Tray.tsx`, `src/ui/SwitchDialog.tsx`, `src/ui/Summary.tsx`: the size cards, the tray and its phone strip, the "smaller box?" dialog, the rail and the sticky bar.
- `src/ui/ProductCard.tsx`, `src/ui/ProductDialog.tsx`, `src/ui/PickControls.tsx`, `src/ui/usePick.ts`: a flavour with its stepper and its price line, and its details with the six-photograph gallery.
- `dev/catalog.ts`: the four demo bundles. `theme/kitenzo-macaron-box.liquid`: the section, with every visible string a setting, and **Low stock from** (`low_stock_at`, 0 to 20, default 5) for when a flavour says how many are left.
- `test/box.test.ts`, `test/autofill.test.ts`, `test/selection.test.ts`, `test/model.test.ts`, `test/copy.test.ts`: the widget's own logic. `test/sdk-contract.test.ts`: the few SDK behaviours it takes on trust. `e2e/macaron-box.spec.ts`: this example's behaviour; `e2e/conformance.spec.ts`: what every Kitenzo custom component must do, on the built asset.

Everything else (config, content, the model, the mount registry, the mock backend) is the starter's, unchanged in purpose; its comments explain the rules each part keeps. Money is the SDK's `useMoney`.

## What the SDK leaves to this widget

- **The box the shopper chose.** The SDK knows that 6, 12 and 24 are the valid counts, holds the step at 24, and counts `progress` up to the next valid count. It has no way to be told "this shopper is filling the box of 12", so with 6 in that box `isSatisfied` is true, `blockedReason` is `null` at a full box of 6, and `progress` says nothing is missing. The widget keeps the chosen size as its own state and adds three things on top of the SDK's answers, nothing instead of them: `box-full` when the SDK would take one more (`blockedInBox` in `src/selection.ts`), "add N more to fill your box of 12" in the status line, and a buy button that also waits for the chosen box to be full.
- **Which box to price before one is filled.** `getBundlePrice` prices any selection, the shopper's or not, but a size has no selection until the shopper fills it, and `getDiscountLadder` names only a tier's set price. So each card asks `getBundlePrice` for sample boxes, one flavour each, one for every distinct pair of price and surcharge on offer (`boxOffers` in `src/box.ts`), and says "from" the lowest when the samples disagree. Whether flavours can change the price is never worked out from the discount's type.
