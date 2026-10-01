/*
 * The box sizes, one card each, drawn from the bundle's `eq` rules and priced by the SDK (box.ts).
 * Nothing here knows there are three, or that they are 6, 12 and 24.
 *
 * A radio group, because exactly one box is chosen at a time. Each card draws its own empty tray
 * in miniature, so the difference between 6 and 24 is something a shopper sees before they read.
 */
import { useId } from 'react';

import { trayColumns } from '../box';
import { text } from '../content';
import { useBuilder } from './context';
import { CheckIcon } from './Icons';

function MiniTray({ size }: { size: number }) {
    return (
        <span className="mcb-size__tray" style={{ gridTemplateColumns: `repeat(${trayColumns(size)}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: size }, (_, index) => (
                <span key={index} className="mcb-size__dot" />
            ))}
        </span>
    );
}

export function SizeChooser() {
    const { box, money, content, locked } = useBuilder();
    const titleId = useId();
    if (!box || box.sizes.length === 0) return null;
    const showPrices = !content.hidePrices;

    return (
        <section className="mcb-step mcb-step--sizes" aria-labelledby={titleId}>
            <header className="mcb-step__header">
                <span className="mcb-step__index" aria-hidden="true">
                    01
                </span>
                <div className="mcb-step__titles">
                    <h3 className="mcb-step__title" id={titleId}>
                        {text(content, 'sizeHeading')}
                    </h3>
                </div>
            </header>
            <div
                className="mcb-sizes"
                role="radiogroup"
                aria-labelledby={titleId}
                style={{ '--mcb-size-count': Math.min(box.sizes.length, 4) } as React.CSSProperties}
            >
                {box.sizes.map((size) => {
                    const offer = box.offers.find((candidate) => candidate.size === size);
                    const chosen = box.size === size;
                    const price = showPrices && offer ? money.format(offer.price) : null;
                    const compareAt = showPrices && offer?.compareAt ? money.format(offer.compareAt) : null;
                    const each = showPrices && offer ? money.format(offer.perItem) : null;
                    return (
                        <button
                            key={size}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            aria-disabled={locked || undefined}
                            className={`mcb-size${chosen ? ' mcb-size--chosen' : ''}`}
                            data-mcb-size={size}
                            onClick={() => {
                                if (!locked && !chosen) box.choose(size);
                            }}
                        >
                            <span className="mcb-size__check" aria-hidden="true">
                                <CheckIcon />
                            </span>
                            <MiniTray size={size} />
                            <span className="mcb-size__name">{text(content, 'sizeOption', { count: size })}</span>
                            {price ? (
                                <span className="mcb-size__price">
                                    {compareAt ? <s className="mcb-size__compare">{compareAt}</s> : null}
                                    <span>{offer!.exact ? price : text(content, 'sizeFrom', { amount: price })}</span>
                                </span>
                            ) : null}
                            {each ? <span className="mcb-size__each">{text(content, 'sizeEach', { amount: each })}</span> : null}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
