# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as usual. The section reads all of it; nothing about what to sell is set in the theme. It is made for this shape:
   - **One step** with all the cans in it.
   - **Limits on the whole bundle**, not on the step: for example at least 6 and at most 24. (Several "exactly" limits, 6, 12 or 24, work too.)
   - **A tiered discount on the number of products**, each tier "at least N": for example 6 for 5% off, 12 for 10%, 24 for 15%. The section draws these as a ladder and tells shoppers how many more reach the next one. Tiers on the amount spent still apply at checkout but are not drawn on the ladder.
   - **Optional: custom text per tier.** A tier's custom text is what shoppers read while that tier is the next one to reach. It can use `{{ amount }}` (how many more), `{{ discount }}` (that tier's discount) and `{{ currentDiscount }}` (the discount of the tier they have reached). Write the `%` yourself: `{{ amount }} more for {{ discount }}% off`. Tiers without custom text use the section's own "Next tier" text.
4. **Optional: subscribe and save.** Add the bundle to a **Recurring bundles** plan in Kitenzo (its name, how often, and its discount). The section offers it next to a one-time purchase and asks for an email. Kitenzo then emails a reminder with a reorder link when the next case is due; the shopper reorders at the member price through a normal checkout. Nothing is charged automatically. The reorder link opens the bundle's page (step 6), so the section must be on it.
5. **Tag your products for the filters.** Give each product tags with a prefix per filter: `Flavor_Fruity`, `Flavor_Citrus`, `Strength_Light`. List the prefixes in the section's **Filters, one per line** setting (the default is `Flavor_ = Flavour` and `Strength_ = Strength`).
6. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
7. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The bundle's discount is applied at checkout by Kitenzo's Cart Transform.

A case bought on a plan also carries the plan on every line: hidden properties Kitenzo reads to start the subscription (`_bundle_frequency`, `_subscription_email`, `_subscription_id`), and two the shopper sees, **Frequency** and **Email** (their names and the "Every 4 weeks" wording are section settings). A reorder from a reminder carries only `_subscription_id`.
