# Installing the Kitenzo Cocktail Case section

This kit adds a mix-a-case bundle builder to your Shopify theme: shoppers filter by your product tags, see what the next discount tier is worth, can let it surprise them, and can join a Recurring bundles plan. It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-cocktail-case.js` and `assets/kitenzo-cocktail-case.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-cocktail-case`, and replace its contents with `sections/kitenzo-cocktail-case.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Cocktail Case**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Save.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Visit the product page: the builder appears.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## 4. Set up the filters, the colours and the words

In the theme editor, on the **Kitenzo Cocktail Case** section:

- **Filters, one per line.** Each line is a tag prefix and the name shoppers see, such as `Flavor_ = Flavour`. A product tagged `Flavor_Fruity` then gets a **Fruity** chip under **Flavour**. Tags without a listed prefix never become chips, so your other tags stay out of the way. Turn **Show filters** off to hide them altogether.
- **Colours.** **Accent** colours the buttons, the discount ladder and every saving; **Case background** and **Text on the case** colour the panel the case is built in. Fonts are your theme's own.
- **Words.** Every heading, label and message is a setting, grouped as Filters, Discount ladder, Surprise me, Subscribe and save, Buttons, Steps, Products, The case and Messages. Clear a setting to go back to its default. The ladder's "Next tier" text is used only for a tier that has no custom text of its own in Kitenzo (see MERCHANT-SETUP.md).
- **Subscribe and save** texts promise a reminder email with a reorder link, because that is what Recurring bundles send. Keep it that way if you edit them: nobody is charged automatically.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, and an unpublished bundle. If no filter chips show, check that your products carry tags starting with the prefixes in **Filters, one per line**, and that each facet has at least two different values.
