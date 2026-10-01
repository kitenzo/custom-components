/*
 * The widget: the ladder, the products, and the buy panel, in one of two layouts.
 *
 *   ladder  compact, for a product page's info column (320 to 480px): the tiers as rows, a short
 *           product list with steppers, the total and the button. The default.
 *   grid    the same bundle as a full-width section: the tiers across, the products as a grid.
 *
 * One component tree serves both; the layout is a class on the root, and the CSS adapts each
 * layout to the width its CONTAINER gives it (container queries on the root), never to the
 * viewport: the same ladder sits in a 340px column on a desktop and fills a phone.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type BundleEditTarget, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { countOf, missingPicks, useSelection, type Missing } from '../selection';
import { BuilderContext, useBuilder, type BuilderContextValue } from './context';
import { imageAttrs } from './images';
import { Ladder, useLadderView } from './Ladder';
import { EditorPanel } from './Notice';
import { ProductCard, ProductRow } from './ProductItem';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { BuyPanel, type BuyState } from './Summary';

export interface EditState {
    isEditing: boolean;
    selections: SectionSelections | null;
    missing: SavedBundleItem[];
    replace: BundleEditTarget | null;
}

interface BuilderProps {
    model: ViewModel;
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: EditState;
}

function missingText(content: MountConfig['content'], missing: Missing): string {
    return missing.section
        ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
        : text(content, 'chooseMore', { count: missing.count });
}

/** The products, as rows (ladder) or cards (grid). Several steps render as several groups. */
function Products({ sections }: { sections: ViewSection[] }) {
    const { selection, content, layout, model, idPrefix } = useBuilder();
    const count = countOf(selection.selections);
    const Item = layout === 'grid' ? ProductCard : ProductRow;
    return (
        <section className="vol-products" aria-labelledby={`${idPrefix}-products-heading`}>
            <header className="vol-products__header">
                <h3 className="vol-products__heading" id={`${idPrefix}-products-heading`}>
                    {sections.length === 1 ? sections[0]!.name || text(content, 'productsHeading') : text(content, 'productsHeading')}
                </h3>
                <span className="vol-products__count" data-filled={count > 0 || undefined}>
                    {text(content, 'chosenCount', { count })}
                </span>
            </header>
            {model.required.length > 0 ? (
                <ul className="vol-included">
                    {model.required.map((entry) => (
                        <li key={entry.product.id} className="vol-included__item">
                            {entry.product.photos[0] ? <img {...imageAttrs(entry.product.photos[0].url, 32)} alt="" width={32} height={32} /> : null}
                            <span>
                                {entry.quantity > 1 ? `${entry.quantity} × ` : ''}
                                {entry.product.title}
                            </span>
                            <span className="vol-included__tag">{text(content, 'included')}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {sections.map((section) => (
                <div key={section.id} className="vol-products__group">
                    {sections.length > 1 ? <h4 className="vol-products__step">{section.name}</h4> : null}
                    <div className={layout === 'grid' ? 'vol-cards' : 'vol-rows'}>
                        {visibleProducts(section, selection.conditions.hiddenProducts).map((product) => (
                            <Item key={product.id} product={product} section={section} />
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}

export function Builder({ model, settings, config, editor, edit }: BuilderProps) {
    const { content, layout } = config;
    const selection = useSelection(model, edit.selections);
    const money = useMoney(model.bundle, settings);
    const ladder = useLadderView(model, selection, money, content);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `vol${useId().replace(/:/g, '')}`;

    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        onAdded: (result) => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            rootRef.current?.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: model.bundle.id, result } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
        },
    });

    const hiddenSections = selection.conditions.hiddenSectionIds;
    const sections = model.sections.filter((section) => !hiddenSections.includes(section.id) && section.products.length > 0);
    const missing = missingPicks(model, selection.selections, hiddenSections);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    const canAdd = selection.isSatisfied && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);
    const count = countOf(selection.selections);

    // When the shopper stays on the page, "Added" shows for a moment, then the builder can add again.
    const { isAdded, reset } = cart;
    useEffect(() => {
        if (isAdded && content.afterAdd === 'stay') {
            const timer = window.setTimeout(reset, 4000);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [isAdded, reset, content.afterAdd]);

    let status = '';
    let statusIsError = false;
    if (cart.shopperMessage) {
        status = unconfirmed ? `${cart.shopperMessage} ${text(content, 'retryAdd')}` : cart.shopperMessage;
        statusIsError = true;
    } else if (cart.isAdded) {
        status = text(content, 'added');
    } else if (draft && editor) {
        status = 'This bundle is a draft, so it previews here but cannot be added to a cart until you publish it in Kitenzo.';
    } else if (blockingProblem) {
        status = text(content, 'unavailable');
    } else if (missing[0]) {
        status = missingText(content, missing[0]);
    } else if (!selection.isSatisfied) {
        // A rule other than a count (one per product, multiples of, a price or weight limit, one of
        // several allowed sizes) refuses this selection. The SDK names it only once every step has a
        // pick, and in its own words, so the merchant's sentence always comes first and the SDK's
        // detail goes to the theme editor.
        status = editor && selection.errors[0] ? `${text(content, 'notAllowed')} (${selection.errors[0].message})` : text(content, 'notAllowed');
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            return;
        }
        void cart.addToCart(model.bundle, selection.selections);
    }, [canAdd, unconfirmed, cart, model.bundle, selection.selections]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const context = useMemo<BuilderContextValue>(
        () => ({
            model,
            selection,
            money,
            content,
            layout,
            editor,
            locked: cart.isAdding || unconfirmed,
            idPrefix,
            openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
        }),
        [model, selection, money, content, layout, editor, cart.isAdding, unconfirmed, idPrefix],
    );

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`vol-root vol-root--${layout}${nudged ? ' vol-root--nudged' : ''}`}
                data-testid="cc-root"
                data-layout={layout}
                data-complete={selection.isSatisfied ? 'true' : 'false'}
                data-qa-count={count}
            >
                <div className="vol-shell">
                    {editor && model.problems.length > 0 ? (
                        <EditorPanel>
                            <ul className="vol-editor-panel__list">
                                {model.problems.map((problem) => (
                                    <li key={problem.detail}>{problem.detail}</li>
                                ))}
                            </ul>
                        </EditorPanel>
                    ) : null}
                    {!editor && blockingProblem ? (
                        <div className="vol-error" data-testid="cc-error" role="alert">
                            <p>{text(content, 'unavailable')}</p>
                        </div>
                    ) : null}
                    <header className="vol-header">
                        <h2 className="vol-header__title">{heading}</h2>
                        {intro ? <p className="vol-header__intro">{intro}</p> : null}
                    </header>
                    {/* Only an edit that will really replace the cart line says so. When the saved bundle
                        could not be restored, `replace` is null and the add creates a new bundle. */}
                    {edit.isEditing && edit.replace ? (
                        <div className="vol-notice" role="status">
                            <p>{text(content, 'editNotice')}</p>
                            {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                        </div>
                    ) : null}
                    <Ladder view={ladder} />
                    <Products sections={sections} />
                    <BuyPanel buy={buy} />
                </div>
                <ProductDialog open={open} onClose={() => setOpen(null)} />
            </div>
        </BuilderContext.Provider>
    );
}
