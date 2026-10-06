/*
 * The discount ladder and "Surprise me", side by side in the case rail because they answer the
 * same question: how do I get to the next tier?
 *
 * The ladder's rungs and where the case stands on them are the SDK's (`readLadder` in
 * src/tiers.ts). The message is the merchant's tier `customText` when there is one, the theme's
 * copy when there is not. "Surprise me" plans on a builder of its own, so the SDK says what fits.
 */
import { useState } from 'react';

import { ceilingOf } from '@kitenzo/react';

import { text } from '../content';
import { nextCaseSize, planSurprise, surpriseCandidates } from '../surprise';
import { discountLabel, ladderMessage } from '../tiers';
import { useBuilder, useSelection } from './context';
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
    const { model, content, money } = useBuilder();
    const { ladder, selections } = useSelection();
    if (!ladder) return null;
    // A money tier with prices hidden would show the amounts the merchant asked to hide.
    if (content.hidePrices && ladder.type !== 'percentage') return null;
    const message = ladderMessage(ladder, model.bundle, selections, content, money);
    const top = ladder.rungs[ladder.rungs.length - 1]!.count;
    const fill = Math.min(1, ladder.count / top);

    if (compact) {
        return (
            <div className="ckc-meter ckc-meter--compact">
                <div className="ckc-meter__track" aria-hidden="true">
                    <span className="ckc-meter__fill" style={{ width: `${fill * 100}%` }} />
                </div>
                {quiet ? null : <p className="ckc-meter__message">{message.text}</p>}
            </div>
        );
    }

    return (
        <div className="ckc-meter" data-testid="ckc-ladder" data-ckc-at-top={ladder.next ? undefined : 'true'}>
            <div className="ckc-meter__head">
                {ladder.discount ? (
                    <span className="ckc-meter__now">
                        <CheckIcon />
                        {text(content, 'tierNow', { discount: discountLabel(content, ladder.type, ladder.discount, money) })}
                    </span>
                ) : null}
            </div>
            <div className="ckc-meter__rail">
                <div className="ckc-meter__track" aria-hidden="true">
                    <span className="ckc-meter__fill" style={{ width: `${fill * 100}%` }} />
                </div>
                <ol className="ckc-meter__rungs">
                    {ladder.rungs.map((rung) => {
                        const position = rung.count / top;
                        return (
                            <li
                                key={rung.count}
                                className={`ckc-rung${ladder.count >= rung.count ? ' ckc-rung--reached' : ''}${rung.count === ladder.next?.count ? ' ckc-rung--next' : ''}`}
                                data-anchor={anchor(position)}
                                style={{ left: `${position * 100}%` }}
                            >
                                <span className="ckc-rung__dot" aria-hidden="true" />
                                <span className="ckc-rung__discount">{discountLabel(content, ladder.type, rung.discount, money)}</span>
                                <span className="ckc-rung__count">{text(content, 'tierRung', { count: rung.count })}</span>
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
    const { model, content, facets, activeFacets, addItem } = useBuilder();
    const { selections, progress, locked, ladder } = useSelection();
    // Required products count toward the case's size, as the engine counts them.
    const count = progress.quantity;
    const target = nextCaseSize(progress, model.bundleLimits, ladder?.rungs.map((rung) => rung.count) ?? []);
    // The note belongs to the case it describes: once the shopper changes the case by hand, it goes.
    const [note, setNote] = useState<{ text: string; at: number } | null>(null);

    const press = () => {
        if (locked) return;
        if (target === null) {
            setNote({ text: text(content, count >= ceilingOf(model.bundleLimits) ? 'surpriseFull' : 'surpriseEmpty'), at: count });
            return;
        }
        // A new seed per press: "again" is a different mix. The plan itself is deterministic per
        // seed, which is what the unit tests pin down.
        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const need = target - count;
        const plan = planSurprise(model.bundle, selections, surpriseCandidates(model, facets, activeFacets), need, seed);
        // The builder reports how many of each it took, so the note counts what went in.
        const added = plan.reduce((sum, pick) => sum + addItem(pick.sectionId, pick.variantId, pick.quantity), 0);
        if (added === 0) {
            setNote({ text: text(content, 'surpriseEmpty'), at: count });
            return;
        }
        setNote({ text: text(content, added < need ? 'surpriseShort' : 'surpriseDone', { count: added }), at: count + added });
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
