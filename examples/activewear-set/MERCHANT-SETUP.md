# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as a set: one step per piece (Top, Bra, Leggings), each limited to **exactly 1** (or **at most 1** for an optional piece). A step that allows more than one piece is refused, because this section draws one size and colour per step. Give it a **set price** discount if the set sells for one price whatever is chosen; the section shows that price before anything is picked. To charge more for some variants (a premium colour), turn on **variant surcharges** for the bundle and set each variant's surcharge; the section shows what each one adds. Nothing about what to sell is set in the theme.
4. **Order each product's options by significance**, most important first (Size, then Colour). A shopper's choice of an earlier option is never changed to reach a later one; a later one is changed, with a message, when the earlier choice rules it out.
5. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
6. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The bundle's discount is applied at checkout by Kitenzo's Cart Transform.
