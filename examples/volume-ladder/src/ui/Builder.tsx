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
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel } from '../model';
import { missingPicks, pickedCount, type Missing } from '../selection';
import { BuilderContext, SelectionContext, useBuilder, useSelection, type BuilderContextValue, type SelectionContextValue } from './context';
import { imageAttrs } from './images';
import { Ladder } from './Ladder';
import { EditorPanel } from './Notice';
import { ProductCard, ProductRow } from './ProductItem';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { BuyPanel, type BuyState } from './Summary';

interface BuilderProps {
    bundle: BundleDetail;
    /** Loaded before the builder renders: they decide what is offered. */
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: Pick<UseBundleEditResult, 'isEditing' | 'selections' | 'missing' | 'replace'>;
}

function missingText(content: MountConfig['content'], missing: Missing): string {
    return missing.section
        ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
        : text(content, 'chooseMore', { count: missing.count });
}

/**
 * The products, as rows (ladder) or cards (grid). Several steps render as several groups.
 * Memoised, with no props: the count in its header changes with a pick, never with the Builder alone.
 */
const Products = memo(function Products() {
    const { content, layout, model, idPrefix } = useBuilder();
    const { progress } = useSelection();
    const { sections } = model;
    const count = pickedCount(progress);
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
                        {section.products.map((product) => (
                            <Item key={product.id} product={product} section={section} />
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
});

export function Builder({ bundle, settings, config, editor, edit }: BuilderProps) {
    const { content, layout } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty bundle for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, updateQuantity, blockedReason } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `vol${useId().replace(/:/g, '')}`;

    const cartWording = useMemo(() => cartMessages(content), [content]);
    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        messages: cartWording,
        onAdded: (result) => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            rootRef.current?.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: bundle.id, result } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
        },
    });

    const missing = missingPicks(model.sections, progress);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;
    const canAdd = builder.isSatisfied && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
    const unconfirmed = cart.isResumable;
    const locked = cart.isAdding || unconfirmed;

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
    } else if (!builder.isSatisfied) {
        // A rule other than a count (multiples of, a price or weight limit, at least N of each)
        // refuses this selection. The SDK names it in `problems`, in its own words, so the
        // merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && builder.problems[0] ? `${text(content, 'notAllowed')} (${builder.problems[0].message})` : text(content, 'notAllowed');
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            return;
        }
        void cart.addToCart(bundle, selections);
    }, [canAdd, unconfirmed, cart, bundle, selections]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    // Two values, each memoised on what it holds. A render that changes neither (the nudge, the
    // details dialog) draws no row, no card and no ladder again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, layout, editor, idPrefix, openDetails, addItem, updateQuantity, blockedReason }),
        [model, money, content, layout, editor, idPrefix, openDetails, addItem, updateQuantity, blockedReason],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked }), [selections, progress, locked]);

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <div
                    ref={rootRef}
                    className={`vol-root vol-root--${layout}${nudged ? ' vol-root--nudged' : ''}`}
                    data-testid="cc-root"
                    data-layout={layout}
                    data-complete={builder.isSatisfied ? 'true' : 'false'}
                    data-qa-count={pickedCount(progress)}
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
                        <Ladder />
                        <Products />
                        <BuyPanel buy={buy} />
                    </div>
                    <ProductDialog open={open} onClose={() => setOpen(null)} />
                </div>
            </SelectionContext.Provider>
        </BuilderContext.Provider>
    );
}
