/*
 * "Your routine": what the quiz built, step by step, and why each product is in it.
 *
 * Shown straight after the last answer (the builder was created holding the routine, so this is
 * the first paint, not a fill-in), and again when the shopper finishes the wizard. It changes
 * nothing itself: "Change" opens a step in the wizard, where the same controls as everywhere
 * else do the changing.
 */
import { forwardRef } from 'react';

import { text } from '../content';
import { useBuilder } from './context';
import { ArrowIcon } from './Icons';
import { imageAttrs } from './images';
import { splitTitle } from './names';
import { useReason, useRoutineLines, type RoutineLine } from './Summary';

interface ReviewProps {
    onAdjust: () => void;
    onRetake: (() => void) | null;
}

function Row({ line, position }: { line: RoutineLine; position: number }) {
    const { money, content, goToStep } = useBuilder();
    const reason = useReason(line.section, line.product);
    const { name, kind } = splitTitle(line.product.title);
    const photo = line.product.photos[0];
    const size = line.variant.title !== 'Default Title' ? line.variant.title : '';
    const price = content.hidePrices ? null : money.format(money.unitPrice(line.variant) * line.quantity);
    return (
        <li className="skr-review__row" data-testid="cc-routine-line" data-handle={line.product.handle} data-variant={line.variant.title}>
            <span className="skr-review__number" aria-hidden="true">
                {String(position).padStart(2, '0')}
            </span>
            <span className="skr-review__photo">{photo ? <img {...imageAttrs(photo.url, 160)} alt="" width={160} height={160} /> : null}</span>
            <span className="skr-review__text">
                <span className="skr-eyebrow">{line.section.name}</span>
                <span className="skr-review__name">
                    {line.quantity > 1 ? `${line.quantity} × ` : ''}
                    {name}
                </span>
                {kind ? <span className="skr-review__kind">{kind}</span> : null}
                {reason ? <span className="skr-reason">{reason}</span> : null}
            </span>
            <span className="skr-review__end">
                <span className="skr-review__price">{[size, price].filter(Boolean).join(' · ')}</span>
                <button type="button" className="skr-link" onClick={() => goToStep(line.section.id)} aria-label={`${text(content, 'change')}: ${line.section.name}`}>
                    {text(content, 'change')}
                </button>
            </span>
        </li>
    );
}

export const Review = forwardRef<HTMLHeadingElement, ReviewProps>(function Review({ onAdjust, onRetake }, headingRef) {
    const { content, answers, goToStep } = useBuilder();
    const steps = useRoutineLines();

    return (
        <div className="skr-review" data-testid="cc-routine">
            <p className="skr-eyebrow">{text(content, 'quizEyebrow')}</p>
            <h2 className="skr-display" ref={headingRef} tabIndex={-1}>
                {text(content, 'routineHeading')}
            </h2>
            {answers.length > 0 ? (
                <>
                    <p className="skr-lede">{text(content, 'routineIntro')}</p>
                    <ul className="skr-chips">
                        {answers.map((answer) => (
                            <li key={answer.id} className="skr-chip">
                                {answer.label}
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
            <ol className="skr-review__list">
                {steps.map(({ section, lines }, index) =>
                    lines.length > 0 ? (
                        lines.map((line) => <Row key={`${section.id}-${line.variant.id}`} line={line} position={index + 1} />)
                    ) : (
                        <li key={section.id} className="skr-review__row skr-review__row--empty">
                            <span className="skr-review__number" aria-hidden="true">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="skr-review__photo" />
                            <span className="skr-review__text">
                                <span className="skr-eyebrow">{section.name}</span>
                                <span className="skr-review__kind">{text(content, 'stepEmpty')}</span>
                            </span>
                            <span className="skr-review__end">
                                <button type="button" className="skr-link" onClick={() => goToStep(section.id)} aria-label={`${text(content, 'choose')}: ${section.name}`}>
                                    {text(content, 'choose')}
                                </button>
                            </span>
                        </li>
                    ),
                )}
            </ol>
            <div className="skr-review__actions">
                <button type="button" className="skr-button skr-button--secondary skr-button--wide" data-testid="cc-routine-adjust" onClick={onAdjust}>
                    {text(content, 'routineAdjust')}
                    <ArrowIcon />
                </button>
                {onRetake ? (
                    <button type="button" className="skr-link" data-testid="cc-routine-retake" onClick={onRetake}>
                        {text(content, 'routineRetake')}
                    </button>
                ) : null}
            </div>
        </div>
    );
});
