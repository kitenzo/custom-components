# Setting up Kitenzo for this section

What has to be true in Kitenzo before the section can show a bundle. Do these once.

1. **Headless is enabled for your shop.** It is invite-only during the beta: email support@kitenzo.com from your store's account with your `myshopify.com` domain. A **Settings > Headless** tab appears in Kitenzo once it is on.
2. **Create an API key** in **Settings > Headless**. Under **Allowed origins**, list every domain your store is served on, for example `https://yourstore.com, https://yourstore.myshopify.com`. The key is shown once; copy it into the section's **Kitenzo headless API key** setting. The key is public by design (it ships in the page, like every storefront key), which is why the allowed origins matter: they stop anyone else's site using it.
3. **Build the bundle in Kitenzo** as usual: its steps, products, limits (how many from each step), required products and discount. The section reads all of it; nothing about what to sell is set in the theme.
4. **Set the bundle's page.** In the bundle's settings, set its page to the product page the section is on. Kitenzo's A/B tests and the cart's "Edit" link both send shoppers there.
5. **Set up personalisation** for the products shoppers personalise (Kitenzo, personalisation sets): for example a required "Engraving" of up to 12 characters on an engravable product, and an optional "Card message" on each card. Use text, dropdown or checkbox fields. Image uploads and fields with a fee are not supported by this section. Each field's name when you first create it becomes the property name on the order and does not change if you rename the label later, so choose it with your packing team in mind.
6. **Check your product descriptions** do not promise personalisation the bundle does not ask for (for example "add a name to the label" on a product with no field).
7. **Check nothing else discounts these products.** A volume discount or automatic discount on the same products stacks with the bundle's own.

## What shoppers' choices look like on an order

Each product in the bundle is its own line on the order, grouped as one bundle by Kitenzo at checkout and carrying a `_bundle_data` property that ties the lines of one bundle together, so two bundles in one order stay apart. The bundle's discount is applied at checkout by Kitenzo's Cart Transform.

What a shopper writes is a property on the line of the product it is for, named by the field: the matchbox's line carries `Engraving: R & J 2026`, the card's line carries `Card message: Happy anniversary`. An order with two gift boxes has two sets of lines, each with its own `_bundle_data`, so each engraving and message is matched to its own box when you pack it. A blank optional message is left off the line entirely.

Place one test order with two personalised boxes before you go live, and check the order page and your packing slip show the properties the way your team needs them.

If a shopper edits a box from the cart, the box's contents come back but what they typed does not (Kitenzo does not store it with the saved box). The section tells them to type it again, and will not add the box until a required field is filled in.
