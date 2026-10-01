# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as usual: its steps, products, limits, required products and discount. The section reads all of it; nothing about what to sell is set in the theme. For a box:
   - **Sizes:** on the step, one limit per box size, each **Total number of products** **equal to** the size (6, 12, 24). Several "equal to" limits on one step mean "any one of these", and each becomes a box card.
   - **Prices:** a **tiered** discount of type **Set price**, one tier per size, each "total products at least N". Tiers must apply the best match only, not add up (the bundle's discount operator is `max`, not `cumulative`): a box of 24 meets all three tiers, and adding them up would charge 6.50 + 12.00 + 22.00.
   - **Stock:** track inventory on the products. A flavour with only a few left stops at that many, and "Fill the rest for me" never picks a sold-out flavour or more than you have.
4. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
5. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The bundle's discount is applied at checkout by Kitenzo's Cart Transform.
