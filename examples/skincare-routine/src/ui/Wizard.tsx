/*
 * The routine, one step on screen at a time.
 *
 * Step pills stay stuck to the top of the widget so the shopper always knows where they are and
 * can go back. A pill ahead of an unfinished step is not a shortcut past it: pressing it says
 * what is still needed, like Continue does. The step's own counts come from its limit rules
 * (`getSectionLimits`, through the model); the wizard never decides a step is done on its own.
 */
import { forwardRef } from 'react';

import { text } from '../content';
import { visibleProducts, type ViewSection } from '../model';
import { countOf, isSingleChoice, isStepMet } from '../selection';
import { useBuilder } from './context';
import { ArrowIcon, BackIcon, CheckIcon } from './Icons';
import { ProductCard } from './ProductCard';

interface WizardProps {
    sections: ViewSection[];
    index: number;
    heading: string;
    intro: string;
    /** Why Continue will not move on yet, or ''. */
    status: string;
    /** Whether a step can be opened yet: every step before it has what it needs. */
    reachable: (index: number) => boolean;
    onStep: (sectionId: number) => void;
    onBack: () => void;
    onContinue: () => void;
}

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === Number.POSITIVE_INFINITY) return `${min}+`;
    return min === max ? String(min) : `${min}–${max}`;
}

/** The step's count, for steps that take more than one product. A one-pick step needs none. */
function Counter({ section }: { section: ViewSection }) {
    const { selection, content } = useBuilder();
    if (isSingleChoice(section)) return null;
    const count = countOf(selection.selections, section.id);
    const optional = section.limits.min === 0;
    const label =
        optional && count === 0
            ? text(content, 'stepOptional')
            : optional && section.limits.max === Number.POSITIVE_INFINITY
              ? text(content, 'stepCount', { count })
              : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    return <span className="skr-panel__counter">{label}</span>;
}

export const Wizard = forwardRef<HTMLHeadingElement, WizardProps>(function Wizard({ sections, index, heading, intro, status, reachable, onStep, onBack, onContinue }, headingRef) {
    const { selection, content, idPrefix } = useBuilder();
    const section = sections[index];
    if (!section) return null;
    const products = visibleProducts(section, selection.conditions.hiddenProducts);
    const last = index === sections.length - 1;
    const met = isStepMet(section, selection.selections);

    return (
        <div className="skr-wizard" data-testid="cc-wizard" data-step={section.id}>
            <header className="skr-header">
                <h2 className="skr-header__title">{heading}</h2>
                {intro ? <p className="skr-header__intro">{intro}</p> : null}
            </header>
            <nav className="skr-pills" aria-label={heading}>
                <ol className="skr-pills__list">
                    {sections.map((entry, position) => {
                        const done = isStepMet(entry, selection.selections) && countOf(selection.selections, entry.id) > 0;
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
                    {products.map((product) => (
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
                        aria-disabled={!met || undefined}
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
