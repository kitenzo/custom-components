# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as usual: its products and its limits. For a ladder, the usual shape is one step with every flavour (or size, or colour) in it, and a bundle-wide minimum such as "at least 2", with no maximum.
4. **Give it tiered discounts on the number of products.** In the bundle's discount settings, choose tiered, then one tier per rung of the ladder, each "number of products is at least N": for example 2 or more 10%, 3 or more 15%, 4 or more 20%, 6 or more 25%. The section draws one row per tier, in order, and highlights the one the shopper has reached. Percentage tiers read best ("Save 15%"); money-off tiers work too and show the amount saved in the shopper's currency. A flat discount works, but there is no ladder to draw, so the section shows only the products and the button.
5. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
6. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own, and the ladder would no longer match what checkout charges.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The tier's discount is applied at checkout by Kitenzo's Cart Transform, from the same tiers the ladder shows.
