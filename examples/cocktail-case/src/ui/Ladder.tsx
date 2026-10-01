/*
 * The discount ladder and "Surprise me", side by side in the case rail because they answer the
 * same question: how do I get to the next tier?
 *
 * The ladder's rungs, fill and message all come from `tierLadder` (src/tiers.ts), which reads the
 * bundle's tiers. The message is the merchant's tier `customText` when there is one, the theme's
 * copy when there is not.
 */
import { useState } from 'react';

import { text } from '../content';
import { countOf } from '../selection';
import { exactSizes, nextCaseSize, planSurprise, sectionRoom, surpriseCandidates } from '../surprise';
import { discountLabel, ladderMessage } from '../tiers';
import { useBuilder } from './context';
import { CheckIcon, SparkleIcon } from './Icons';

/** Where a marker's label sits, so the first and last never hang off the track. */
function anchor(position: number): string {
    if (position >= 0.9) return 'end';
    if (position <= 0.1) return 'start';
    return 'middle';
}

/**
 * `compact` is the mobile bar's version: the fill and one line. `quiet` drops that line while
 * the bar has something more urgent to say (why the button will not add yet).
 */
export function LadderMeter({ compact = false, quiet = false }: { compact?: boolean; quiet?: boolean }) {
    const { ladder, content, money } = useBuilder();
    if (!ladder) return null;
    // A money tier with prices hidden would show the amounts the merchant asked to hide.
    if (content.hidePrices && ladder.type !== 'percentage') return null;
    const message = ladderMessage(ladder, content, money.format);
    const top = ladder.rungs[ladder.rungs.length - 1]!.threshold;

    if (compact) {
        return (
            <div className="ckc-meter ckc-meter--compact">
                <div className="ckc-meter__track" aria-hidden="true">
                    <span className="ckc-meter__fill" style={{ width: `${ladder.progress * 100}%` }} />
                </div>
                {quiet ? null : <p className="ckc-meter__message">{message.text}</p>}
            </div>
        );
    }

    return (
        <div className="ckc-meter" data-testid="ckc-ladder" data-ckc-at-top={ladder.next ? undefined : 'true'}>
            <div className="ckc-meter__head">
                {ladder.inForce > 0 ? (
                    <span className="ckc-meter__now">
                        <CheckIcon />
                        {text(content, 'tierNow', { discount: discountLabel(content, ladder.type, ladder.inForce, money.format) })}
                    </span>
                ) : null}
            </div>
            <div className="ckc-meter__rail">
                <div className="ckc-meter__track" aria-hidden="true">
                    <span className="ckc-meter__fill" style={{ width: `${ladder.progress * 100}%` }} />
                </div>
                <ol className="ckc-meter__rungs">
                    {ladder.rungs.map((rung) => {
                        const position = rung.threshold / top;
                        return (
                            <li
                                key={rung.threshold}
                                className={`ckc-rung${rung.reached ? ' ckc-rung--reached' : ''}${rung === ladder.next ? ' ckc-rung--next' : ''}`}
                                data-anchor={anchor(position)}
                                style={{ left: `${position * 100}%` }}
                            >
                                <span className="ckc-rung__dot" aria-hidden="true" />
                                <span className="ckc-rung__discount">{discountLabel(content, ladder.type, rung.effective, money.format)}</span>
                                <span className="ckc-rung__count">{text(content, 'tierRung', { count: rung.threshold })}</span>
                            </li>
                        );
                    })}
                </ol>
            </div>
            <p className="ckc-meter__message" aria-live="polite" data-testid="ckc-ladder-message" data-ckc-custom={message.custom || undefined}>
                {message.text}
            </p>
        </div>
    );
}

export function SurpriseButton() {
    const { model, selection, content, locked, ladder, facetDefs, activeFacets } = useBuilder();
    // Required products count toward the case's size, as the engine counts them.
    const count = countOf(selection.selections) + model.requiredCount;
    const target = nextCaseSize(count, model.bundleLimits, ladder, exactSizes(model.bundle));
    // The note belongs to the case it describes: once the shopper changes the case by hand, it goes.
    const [note, setNote] = useState<{ text: string; at: number } | null>(null);

    const press = () => {
        if (locked) return;
        if (target === null) {
            setNote({ text: text(content, count >= model.bundleLimits.max ? 'surpriseFull' : 'surpriseEmpty'), at: count });
            return;
        }
        const candidates = surpriseCandidates({
            model,
            selections: selection.selections,
            hiddenSectionIds: selection.conditions.hiddenSectionIds,
            hiddenProducts: selection.conditions.hiddenProducts,
            facetDefs,
            activeFacets,
        });
        // A new seed per press: "again" is a different mix. The plan itself is deterministic per
        // seed, which is what the unit tests pin down.
        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const plan = planSurprise(candidates, target - count, sectionRoom(model, selection.selections), seed);
        if (plan.added === 0) {
            setNote({ text: text(content, 'surpriseEmpty'), at: count });
            return;
        }
        for (const pick of plan.picks) selection.builder.addItem(pick.sectionId, pick.variantId, pick.quantity);
        setNote({ text: text(content, plan.short > 0 ? 'surpriseShort' : 'surpriseDone', { count: plan.added }), at: count + plan.added });
    };

    const refusing = target === null || locked;
    return (
        <div className="ckc-surprise">
            <button type="button" className="ckc-surprise__button" data-testid="ckc-surprise" aria-disabled={refusing || undefined} onClick={press}>
                <SparkleIcon />
                <span className="ckc-surprise__label">{text(content, 'surprise')}</span>
                {target !== null ? <span className="ckc-surprise__target">{text(content, 'surpriseTo', { count: target })}</span> : null}
            </button>
            <p className="ckc-surprise__note" role="status">
                {note && note.at === count ? note.text : ''}
            </p>
        </div>
    );
}
