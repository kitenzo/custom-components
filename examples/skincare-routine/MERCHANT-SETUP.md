# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as usual: its steps, products, limits (how many from each step), required products and discount. The section reads all of it; nothing about what to sell is set in the theme. For a routine:
   - **One step per stage of the routine** (for example Cleanse, Treat, Moisturise), in the order the shopper should use them. The quiz fills each step with as many products as the step's limit asks for, and the builder shows one step at a time.
   - **"Total number of products equal to 1"** on a step makes it a choice: choosing another product swaps it in. A step that takes more than one product shows a quantity control instead.
   - **"Advance to the next step when this one is done"** is followed per step. Turn it on where one pick finishes the step, and off where the shopper should look before moving on.
4. **Tag your products.** The quiz matches answers to product tags, so each product needs tags that describe who it is for (`dry-skin`, `oily-skin`, `sensitive-skin`) and what it does (`brightening`, `barrier-repair`, `acne-prone`). Use the tags you already have where you can: each quiz answer in the section's settings lists the tags it matches, and you can change those to fit your catalogue. Tags starting `bundle-builder-` are Kitenzo's own and are never shown to the quiz.
5. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
6. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The bundle's discount is applied at checkout by Kitenzo's Cart Transform.
