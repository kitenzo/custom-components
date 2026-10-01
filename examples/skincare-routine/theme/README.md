# Installing the Kitenzo Skincare Routine section

This kit adds a Kitenzo routine builder to your Shopify theme: a short skin quiz that puts together a routine from your products, then a step-by-step builder where the shopper can change it before adding it to the cart. It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-skincare-routine.js` and `assets/kitenzo-skincare-routine.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-skincare-routine`, and replace its contents with `sections/kitenzo-skincare-routine.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Skincare Routine**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Save.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Visit the product page: the builder appears.

## 4. Set up the quiz

The quiz's wording is in the section's settings, under **Quiz**. The questions themselves are the section's **Question** blocks, three to start with: add one (up to five), remove one or drag them into another order as you would any block. Every question, hint and answer is yours to rewrite.

Each answer has a **tags** setting: the product tags that answer matches, separated by commas, written exactly as they are on your products (Shopify admin, a product's **Tags** box). For every step of the bundle, the routine takes the product that matches the most answers. It never takes a sold-out product or a sold-out size. When nothing in a step matches, it takes the first product that is in stock, in the order the step lists them in Kitenzo, and says "Our suggestion for this step" instead of claiming a match.

- To shorten the quiz, remove a Question block (or clear its question to hide it). Clear an answer's label to remove that answer.
- An answer with no tags (the default "Both") is fine: it is a choice that does not steer the routine.
- If you remove every Question block, the section skips the quiz and opens straight on the builder.

Shoppers can always skip the quiz. A shopper who edits a routine from the cart goes straight to the builder with their routine in it.

## 5. If your theme has a sticky header

The row of step buttons sticks to the top of the screen as the shopper scrolls. If your theme's header also sticks, set **Space above the step bar** (under **Layout**) to the header's height, so the two do not overlap.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, and an unpublished bundle.
