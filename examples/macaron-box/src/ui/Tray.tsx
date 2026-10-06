/*
 * The box itself: one slot per macaron, filled in the order the shopper picked.
 *
 * Slots are drawn from the chosen size (or the step's own maximum when the bundle sells no fixed
 * sizes), never from a number written here. A filled slot is a button: tapping it takes that
 * macaron out, and that slot empties, not the newest of its flavour (selection.ts, `removeAt`).
 *
 * `Tray` is the full box in the rail; `TrayStrip` is the same box in miniature for the sticky bar
 * on a phone, where it doubles as a way back to the full box.
 */
import { trayColumns, type Placed } from '../box';
import { text } from '../content';
import type { ViewProduct } from '../model';
import { useBuilder, useSelection } from './context';
import { CloseIcon, SparkleIcon } from './Icons';
import { imageAttrs } from './images';

interface Slot {
    /** Position in the whole pick order, for `removeAt`. */
    orderIndex: number;
    entry: Placed;
    product: ViewProduct | undefined;
}

function useSlots(): { filled: Slot[]; slots: number | null; count: number } {
    const { box } = useBuilder();
    const { order, progress, slots } = useSelection();
    if (!box) return { filled: [], slots: null, count: 0 };
    const filled = order
        .map((entry, orderIndex) => ({ entry, orderIndex }))
        .filter(({ entry }) => entry.sectionId === box.section.id)
        .map(({ entry, orderIndex }) => ({ orderIndex, entry, product: box.section.byVariantId.get(entry.variantId)?.product }));
    return { filled, slots, count: progress.sections[box.section.id]?.quantity ?? 0 };
}

function Macaron({ product, size }: { product: ViewProduct | undefined; size: number }) {
    const photo = product?.photos[0];
    if (!photo) {
        return (
            <span className="mcb-slot__initial" aria-hidden="true">
                {product?.title.slice(0, 1) ?? ''}
            </span>
        );
    }
    return <img className="mcb-slot__photo" {...imageAttrs(photo.url, size)} alt="" width={size} height={size} decoding="async" />;
}

export function Tray({ id }: { id: string }) {
    const { box, content, idPrefix } = useBuilder();
    const { locked, size, removeAt, fillRest, fillNote } = useSelection();
    const { filled, slots, count } = useSlots();
    if (!box) return null;

    if (box.sizes.length > 0 && size === null) {
        return (
            <div className="mcb-tray mcb-tray--unchosen" id={id}>
                <p className="mcb-tray__prompt">{text(content, 'chooseSize')}</p>
            </div>
        );
    }

    // No fixed size and no maximum: the tray grows with the picks, one open slot ahead.
    const total = slots ?? filled.length + 1;
    const columns = trayColumns(slots ?? Math.max(6, total));
    const empty = slots === null ? 0 : Math.max(0, slots - count);

    return (
        <div className="mcb-tray-wrap" id={id}>
            <ol
                className={`mcb-tray${total > 12 ? ' mcb-tray--dense' : ''}`}
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                data-testid="mcb-tray"
                data-slots={total}
                aria-label={text(content, 'summaryHeading')}
            >
                {Array.from({ length: total }, (_, position) => {
                    const slot = filled[position];
                    if (!slot) {
                        return (
                            <li key={`empty-${position}`} className="mcb-slot mcb-slot--empty" aria-label={text(content, 'emptySlot', { count: position + 1 })}>
                                <span className="mcb-slot__well" aria-hidden="true">
                                    {position + 1}
                                </span>
                            </li>
                        );
                    }
                    const title = slot.product?.title ?? '';
                    return (
                        <li key={`${slot.entry.variantId}-${slot.orderIndex}`} className="mcb-slot mcb-slot--filled">
                            <button
                                type="button"
                                className="mcb-slot__button"
                                data-mcb-slot={position}
                                data-mcb-slot-product={slot.product?.handle}
                                aria-label={`${text(content, 'remove')} ${title}`}
                                title={title}
                                aria-disabled={locked || undefined}
                                onClick={() => {
                                    if (locked) return;
                                    removeAt(slot.orderIndex);
                                    // The pressed slot re-renders as another macaron or an empty
                                    // well. Keep a keyboard user where they were: on the macaron
                                    // that moved into this slot, else on the box's heading.
                                    window.setTimeout(() => {
                                        const next = document.querySelector<HTMLElement>(`#${CSS.escape(id)} [data-mcb-slot="${position}"]`);
                                        (next ?? document.getElementById(`${idPrefix}-summary-heading`))?.focus();
                                    }, 0);
                                }}
                            >
                                <span className="mcb-slot__disc">
                                    <Macaron product={slot.product} size={total > 12 ? 56 : 88} />
                                </span>
                                <span className="mcb-slot__remove" aria-hidden="true">
                                    <CloseIcon />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {empty > 0 ? (
                <button
                    type="button"
                    className="mcb-fill"
                    data-testid="mcb-fill"
                    aria-disabled={locked || undefined}
                    onClick={() => {
                        if (!locked) fillRest();
                    }}
                >
                    <SparkleIcon />
                    {text(content, 'fillRest')}
                </button>
            ) : null}
            {fillNote ? (
                <p className="mcb-tray__note" role="status">
                    {fillNote}
                </p>
            ) : null}
        </div>
    );
}

/** The box in miniature, for the phone's sticky bar. Tapping it scrolls to the full box. */
export function TrayStrip({ target }: { target: string }) {
    const { box, content } = useBuilder();
    const { filled, slots, count } = useSlots();
    if (!box || slots === null) return null;
    const columns = Math.min(slots, 12);
    const label = `${text(content, 'summaryHeading')}, ${text(content, 'trayCount', { count, size: slots })}`;
    return (
        <button
            type="button"
            className="mcb-strip"
            aria-label={label}
            onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
            <span className="mcb-strip__slots" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden="true">
                {Array.from({ length: slots }, (_, position) => {
                    const slot = filled[position];
                    return (
                        <span key={position} className={`mcb-strip__slot${slot ? ' mcb-strip__slot--filled' : ''}`}>
                            {slot ? <Macaron product={slot.product} size={24} /> : null}
                        </span>
                    );
                })}
            </span>
            <span className="mcb-strip__count" aria-hidden="true">
                {text(content, 'trayCount', { count, size: slots })}
            </span>
        </button>
    );
}
