/*
 * The case: every can in it, the ladder, "Surprise me", the plan, the price and the button that
 * buys it. A rail beside the cans on wide screens, below them (with a bar stuck to the bottom of
 * the widget holding the buy button) on narrow ones.
 *
 * Both the rail and the bar carry `cc-add-to-cart`, and CSS decides which one shows. JavaScript
 * never mirrors a CSS breakpoint to decide where a test id or a button goes.
 */
import { useRef, type RefObject } from 'react';

import { useBundlePrice, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct } from '../model';
import { countOf } from '../selection';
import { useBuilder } from './context';
import { CanIcon } from './Icons';
import { imageAttrs } from './images';
import { LadderMeter, SurpriseButton } from './Ladder';
import { PlanPicker } from './PlanPicker';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
    /** The button's words: one-time, joining the club, or reordering. */
    label: string;
    /** The shopper has tried to add, or left the email field: plan problems may show. */
    planTouched: boolean;
    touchPlan: () => void;
}

function PriceBlock({ compact = false }: { compact?: boolean }) {
    const { model, selection, money, content, plan } = useBuilder();
    // The plan's discount is the SDK's to price: the chosen plan rides along, never a sum of ours.
    const price = useBundlePrice(model.bundle, selection.selections, { recurring: plan.choice });
    if (content.hidePrices || price.discountedPrice === null) return null;
    const total = Number(price.discountedPrice);
    const original = price.originalPrice === null ? null : Number(price.originalPrice);
    const saving = original !== null && original > total ? original - total : 0;
    return (
        <div className={`ckc-price${compact ? ' ckc-price--compact' : ''}`}>
            {compact ? null : <span className="ckc-price__label">{text(content, 'total')}</span>}
            <span className="ckc-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="ckc-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="ckc-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="ckc-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
                    {text(content, 'saving', { amount: money.format(saving) ?? '' })}
                </span>
            ) : null}
        </div>
    );
}

function BuyButton({ buy }: { buy: BuyState }) {
    const { content } = useBuilder();
    const label = buy.cart.isAdding ? text(content, 'adding') : buy.cart.isAdded ? text(content, 'added') : buy.label;
    return (
        <button
            type="button"
            className="ckc-button ckc-button--primary ckc-buy"
            data-testid="cc-add-to-cart"
            aria-disabled={!buy.canAdd || buy.cart.isAdding || undefined}
            aria-busy={buy.cart.isAdding || undefined}
            onClick={buy.onAdd}
        >
            {label}
        </button>
    );
}

/*
 * Two live regions, both always in the page. A screen reader announces a change to a region it
 * already knows about; an element that turns into an alert in the same render as its text often
 * goes unannounced.
 */
function Status({ buy }: { buy: BuyState }) {
    return (
        <div className="ckc-status-wrap">
            <p className="ckc-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="ckc-status ckc-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

interface Can {
    key: string;
    sectionId: number;
    variantId: string;
    product: ViewProduct;
    /** How many of this variant are in this step: what the slot's "remove one" leaves behind. */
    quantity: number;
}

/**
 * The case drawn as slots: one per can, filled in the order they went in, up to the bundle's
 * maximum (or, with no maximum, the next tier). A slot that completes a tier is ringed, so the
 * shopper sees where each saving starts. A filled slot is a button that takes that can back out.
 */
function CaseSlots({ headingRef }: { headingRef: RefObject<HTMLHeadingElement> }) {
    const { model, selection, content, locked, ladder } = useBuilder();
    const cans: Can[] = model.sections.flatMap((section) =>
        (selection.selections[section.id] ?? []).flatMap((pick) => {
            const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
            if (!product) return [];
            return Array.from({ length: pick.quantity }, (_, index) => ({
                key: `${section.id}-${pick.variantId}-${index}`,
                sectionId: section.id,
                variantId: pick.variantId,
                product,
                quantity: pick.quantity,
            }));
        }),
    );
    const required = model.required.flatMap((entry) => Array.from({ length: entry.quantity }, (_, index) => ({ entry, index })));
    const max = model.bundleLimits.max;
    const reach = Number.isFinite(max) && max <= 48 ? max : Math.max(ladder?.next?.threshold ?? 0, model.bundleLimits.min, cans.length + 1);
    const total = Math.max(reach, cans.length + required.length);
    const rungs = new Set(ladder?.rungs.map((rung) => rung.threshold) ?? []);
    const empty = Math.max(0, total - cans.length - required.length);
    // Rows of 8 for a big case, 6 for a small one, so a 24 is three rows and a 12 is two.
    const columns = total <= 8 ? total : total <= 12 && total % 6 === 0 ? 6 : 8;

    return (
        <ol className="ckc-slots" data-testid="ckc-slots" style={{ ['--ckc-slot-columns' as string]: String(columns) }}>
            {required.map(({ entry, index }) => (
                <li key={`required-${entry.product.id}-${index}`} className="ckc-slot ckc-slot--included" title={`${entry.product.title}: ${text(content, 'included')}`}>
                    {entry.product.photos[0] ? <img {...imageAttrs(entry.product.photos[0].url, 56)} alt={entry.product.title} width={56} height={56} /> : <CanIcon />}
                </li>
            ))}
            {cans.map((can, index) => {
                const position = required.length + index + 1;
                return (
                    <li key={can.key} className={`ckc-slot ckc-slot--filled${rungs.has(position) ? ' ckc-slot--rung' : ''}`}>
                        <button
                            type="button"
                            className="ckc-slot__button"
                            aria-label={`${text(content, 'remove')} ${can.product.title}`}
                            title={`${text(content, 'remove')} ${can.product.title}`}
                            aria-disabled={locked || undefined}
                            onClick={() => {
                                if (locked) return;
                                selection.builder.updateQuantity(can.sectionId, can.variantId, can.quantity - 1);
                                // The slot pressed is gone (the cans shift up); focus goes to the case's
                                // heading rather than falling to the top of the page.
                                headingRef.current?.focus();
                            }}
                        >
                            {can.product.photos[0] ? <img {...imageAttrs(can.product.photos[0].url, 56)} alt="" width={56} height={56} /> : <CanIcon />}
                        </button>
                    </li>
                );
            })}
            {Array.from({ length: empty }, (_, index) => {
                const position = required.length + cans.length + index + 1;
                return (
                    <li key={`empty-${position}`} className={`ckc-slot${rungs.has(position) ? ' ckc-slot--rung' : ''}`} aria-hidden="true">
                        <CanIcon />
                    </li>
                );
            })}
        </ol>
    );
}

export function SummaryRail({ buy }: { buy: BuyState }) {
    const { model, selection, content } = useBuilder();
    const count = countOf(selection.selections) + model.requiredCount;
    const max = model.bundleLimits.max;
    const headingRef = useRef<HTMLHeadingElement>(null);
    return (
        <aside className="ckc-summary" aria-label={text(content, 'summaryHeading')}>
            <div className="ckc-summary__head">
                <h3 className="ckc-summary__heading" ref={headingRef} tabIndex={-1}>
                    {text(content, 'summaryHeading')}
                </h3>
                <span className="ckc-summary__count" data-testid="ckc-case-count">
                    {Number.isFinite(max) ? text(content, 'caseCountRange', { count, max }) : text(content, 'caseCount', { count })}
                </span>
            </div>
            <CaseSlots headingRef={headingRef} />
            {count === 0 ? <p className="ckc-summary__empty">{text(content, 'summaryEmpty')}</p> : null}
            <LadderMeter />
            <SurpriseButton />
            <PlanPicker touched={buy.planTouched} onTouch={buy.touchPlan} />
            <div className="ckc-summary__checkout">
                <PriceBlock />
                <BuyButton buy={buy} />
                <Status buy={buy} />
            </div>
        </aside>
    );
}

export function MobileBar({ buy }: { buy: BuyState }) {
    const { selection, model } = useBuilder();
    return (
        <div className="ckc-mobile-bar" data-testid="cc-mobile-bar">
            <LadderMeter compact quiet={buy.status !== ''} />
            <div className="ckc-mobile-bar__row">
                <div className="ckc-mobile-bar__info">
                    <span className="ckc-mobile-bar__count">{countOf(selection.selections) + model.requiredCount}</span>
                    <PriceBlock compact />
                </div>
                <BuyButton buy={buy} />
            </div>
            <Status buy={buy} />
        </div>
    );
}
