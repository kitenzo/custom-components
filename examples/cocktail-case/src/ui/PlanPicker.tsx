/*
 * Buy once, or join the club: Kitenzo Recurring bundles through `useRecurringPlan`.
 *
 * Never Shopify selling plans, and never "we will charge you every 4 weeks": a Recurring bundles
 * subscription is a reminder email with a reorder link, and the copy says exactly that. The email
 * field is required for a new subscription (the reminders go to it) and is checked by the SDK
 * (`plan.errors`) before anything is sent; the theme's sentence for the failure is shown once the
 * shopper has tried to add or has left the field.
 *
 * Each tile shows what the case costs on that plan, priced by `useBundlePrice` with that plan's
 * choice, so the comparison is the SDK's arithmetic, not ours.
 */
import { useId } from 'react';

import { useBundlePrice, type RecurringChoice, type RecurringOption } from '@kitenzo/react';

import { text } from '../content';
import { frequencyText, planDiscount, planProblem } from '../recurring';
import { countOf } from '../selection';
import { useBuilder } from './context';
import { BellIcon } from './Icons';

function TilePrice({ choice }: { choice: RecurringChoice | null }) {
    const { model, selection, money, content } = useBuilder();
    const price = useBundlePrice(model.bundle, selection.selections, { recurring: choice });
    if (content.hidePrices || price.discountedPrice === null || countOf(selection.selections) === 0) return null;
    return <span className="ckc-plan__price">{money.format(Number(price.discountedPrice))}</span>;
}

/** The choice a plan's tile prices at: its first cadence, before any email is typed. */
function previewChoice(option: RecurringOption): RecurringChoice | null {
    const first = option.frequencies[0];
    return first ? { type: 'new', optionId: option.id, frequency: first.frequency, unit: first.unit, email: '' } : null;
}

export function PlanPicker({ touched, onTouch }: { touched: boolean; onTouch: () => void }) {
    const { plan, content, money, locked } = useBuilder();
    const id = useId();
    if (plan.subscription) {
        const saving = planDiscount(content, plan.subscription.discountType, plan.subscription.discountValue, money.format);
        return (
            <div className="ckc-plan ckc-plan--reorder" data-testid="ckc-plan">
                <p className="ckc-plan__reorder">
                    <BellIcon />
                    <span>{frequencyText(content, plan.subscription.frequency, plan.subscription.unit)}</span>
                    {saving ? <span className="ckc-plan__save">{saving}</span> : null}
                </p>
            </div>
        );
    }
    if (!plan.hasOptions) return null;

    const problem = planProblem(content, plan.errors, plan.choice);
    const showProblem = touched && problem !== null;
    const name = `${id}-plan`;

    return (
        <fieldset className="ckc-plan" data-testid="ckc-plan" disabled={locked}>
            <legend className="ckc-plan__heading">{text(content, 'planHeading')}</legend>
            <div className="ckc-plan__options">
                <label className={`ckc-plan__option${plan.selectedOption ? '' : ' ckc-plan__option--on'}`}>
                    <input type="radio" className="ckc-radio" name={name} checked={!plan.selectedOption} onChange={() => plan.selectOption(null)} data-ckc-plan="one-time" />
                    <span className="ckc-plan__text">
                        <span className="ckc-plan__name">{text(content, 'planOneTime')}</span>
                        <span className="ckc-plan__note">{text(content, 'planOneTimeNote')}</span>
                    </span>
                    <TilePrice choice={null} />
                </label>
                {plan.options.map((option) => {
                    const on = plan.selectedOption?.id === option.id;
                    const saving = planDiscount(content, option.discountType, option.discountValue, money.format);
                    return (
                        <label key={option.id} className={`ckc-plan__option ckc-plan__option--club${on ? ' ckc-plan__option--on' : ''}`}>
                            <input type="radio" className="ckc-radio" name={name} checked={on} onChange={() => plan.selectOption(option.id)} data-ckc-plan={option.id} />
                            <span className="ckc-plan__text">
                                <span className="ckc-plan__name">{option.name}</span>
                                {saving ? (
                                    <span className="ckc-plan__save">
                                        {text(content, option.applyDiscountToInitialOrder ? 'planSave' : 'planSaveLater', { discount: saving })}
                                    </span>
                                ) : null}
                            </span>
                            <TilePrice choice={previewChoice(option)} />
                        </label>
                    );
                })}
            </div>
            {plan.selectedOption ? (
                <div className="ckc-plan__details">
                    <p className="ckc-plan__promise">
                        <BellIcon />
                        <span>{text(content, 'planPromise')}</span>
                    </p>
                    {plan.selectedOption.frequencies.length > 1 ? (
                        <div className="ckc-plan__frequencies" role="radiogroup" aria-label={text(content, 'planFrequency')}>
                            <span className="ckc-plan__label" aria-hidden="true">
                                {text(content, 'planFrequency')}
                            </span>
                            <div className="ckc-plan__chips">
                                {plan.selectedOption.frequencies.map((frequency) => (
                                    <label key={frequency.id} className={`ckc-chip ckc-chip--radio${plan.selectedFrequency?.id === frequency.id ? ' ckc-chip--active' : ''}`}>
                                        <input
                                            type="radio"
                                            className="ckc-visually-hidden"
                                            name={`${id}-frequency`}
                                            checked={plan.selectedFrequency?.id === frequency.id}
                                            onChange={() => plan.selectFrequency(frequency.id)}
                                            data-ckc-frequency={frequency.id}
                                        />
                                        {frequencyText(content, frequency.frequency, frequency.unit)}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <label className="ckc-field" htmlFor={`${id}-email`}>
                        <span className="ckc-plan__label">{text(content, 'emailLabel')}</span>
                        <input
                            id={`${id}-email`}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            className="ckc-input"
                            placeholder={text(content, 'emailPlaceholder')}
                            value={plan.email}
                            onChange={(event) => plan.setEmail(event.target.value)}
                            onBlur={() => {
                                if (plan.email.trim()) onTouch();
                            }}
                            aria-invalid={showProblem || undefined}
                            aria-describedby={showProblem ? `${id}-problem` : undefined}
                            data-ckc-email
                        />
                    </label>
                    <p id={`${id}-problem`} className="ckc-plan__problem" aria-live="polite" data-testid="ckc-plan-problem">
                        {showProblem ? problem : ''}
                    </p>
                </div>
            ) : null}
        </fieldset>
    );
}
