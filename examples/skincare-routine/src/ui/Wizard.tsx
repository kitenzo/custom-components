/*
 * The routine, one step on screen at a time.
 *
 * Step pills stay stuck to the top of the widget so the shopper always knows where they are and
 * can go back. A pill ahead of an unfinished step is not a shortcut past it: pressing it says
 * what is still needed, like Continue does. Whether a step has what it needs is the SDK's answer,
 * read from the step's limit rules: `isSectionValid` for the step on screen, `progress` for the
 * pills of the others. The wizard never decides a step is done on its own. Which steps and
 * products are on screen is the SDK's too: the model already leaves out what a condition hides.
 */
import { forwardRef } from 'react';

import { text } from '../content';
import type { ViewSection } from '../model';
import { isSingleChoice, isStepDone } from '../selection';
import { useBuilder, useSelection } from './context';
import { ArrowIcon, BackIcon, CheckIcon } from './Icons';
import { ProductCard } from './ProductCard';

interface WizardProps {
    /** Where the step on screen sits among the model's steps. */
    index: number;
    heading: string;
    intro: string;
    /** Why Continue will not move on yet, or ''. */
    status: string;
    /** The SDK's answer for the step on screen: its own count is acceptable. */
    canContinue: boolean;
    /** Whether a step can be opened yet: every step before it has what it needs. */
    reachable: (index: number) => boolean;
    onStep: (sectionId: number) => void;
    onBack: () => void;
    onContinue: () => void;
}

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === null) return `${min}+`;
    return min === max ? String(min) : `${min}–${max}`;
}

/** The step's count, for steps that take more than one product. A one-pick step needs none. */
function Counter({ section }: { section: ViewSection }) {
    const { content } = useBuilder();
    const { progress } = useSelection();
    if (isSingleChoice(section)) return null;
    const count = progress.sections[section.id]?.quantity ?? 0;
    const optional = section.limits.min === 0;
    const label =
        optional && count === 0
            ? text(content, 'stepOptional')
            : optional && section.limits.max === null
              ? text(content, 'stepCount', { count })
              : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    return <span className="skr-panel__counter">{label}</span>;
}

export const Wizard = forwardRef<HTMLHeadingElement, WizardProps>(function Wizard({ index, heading, intro, status, canContinue, reachable, onStep, onBack, onContinue }, headingRef) {
    const { model, content, idPrefix } = useBuilder();
    const { progress } = useSelection();
    const { sections } = model;
    const section = sections[index];
    if (!section) return null;
    const last = index === sections.length - 1;

    return (
        <div className="skr-wizard" data-testid="cc-wizard" data-step={section.id}>
            <header className="skr-header">
                <h2 className="skr-header__title">{heading}</h2>
                {intro ? <p className="skr-header__intro">{intro}</p> : null}
            </header>
            <nav className="skr-pills" aria-label={heading}>
                <ol className="skr-pills__list">
                    {sections.map((entry, position) => {
                        const done = isStepDone(entry, progress);
                        const current = position === index;
                        return (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    className={`skr-pill${current ? ' skr-pill--current' : ''}${done ? ' skr-pill--done' : ''}`}
                                    aria-current={current ? 'step' : undefined}
                                    aria-disabled={!reachable(position) || undefined}
                                    data-cc-step={entry.id}
                                    onClick={() => onStep(entry.id)}
                                >
                                    <span className="skr-pill__mark" aria-hidden="true">
                                        {done && !current ? <CheckIcon /> : position + 1}
                                    </span>
                                    <span className="skr-pill__name">{entry.name}</span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </nav>
            <section className="skr-panel" aria-labelledby={`${idPrefix}-step-title-${section.id}`}>
                <div className="skr-panel__header">
                    <div>
                        <p className="skr-eyebrow">{text(content, 'wizardStep', { current: index + 1, total: sections.length })}</p>
                        <h3 className="skr-panel__title" id={`${idPrefix}-step-title-${section.id}`} ref={headingRef} tabIndex={-1}>
                            {section.name}
                        </h3>
                        {section.description ? <p className="skr-panel__description">{section.description}</p> : null}
                    </div>
                    <Counter section={section} />
                </div>
                <div className="skr-grid">
                    {section.products.map((product) => (
                        <ProductCard key={product.id} product={product} section={section} />
                    ))}
                </div>
                <div className="skr-nav">
                    {index > 0 ? (
                        <button type="button" className="skr-link skr-link--quiet" data-testid="cc-wizard-back" onClick={onBack}>
                            <BackIcon />
                            {text(content, 'back')}
                        </button>
                    ) : (
                        <span />
                    )}
                    <p className="skr-nav__status" role="status">
                        {status}
                    </p>
                    <button
                        type="button"
                        className="skr-button skr-button--primary skr-nav__next"
                        data-testid="cc-wizard-next"
                        aria-disabled={!canContinue || undefined}
                        onClick={onContinue}
                    >
                        {text(content, last ? 'wizardReview' : 'wizardContinue')}
                        <ArrowIcon />
                    </button>
                </div>
            </section>
        </div>
    );
});
