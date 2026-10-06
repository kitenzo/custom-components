/*
 * The inputs for what the shopper writes: an engraving, a card message, whatever fields the
 * merchant defined for the products in the box.
 *
 * Rendered under the step the product was chosen in, so the matchbox's engraving sits next to the
 * matchbox and the message next to the card, and only once the product is in the box. Every word
 * of a field (label, placeholder, help, limit, required, fee) is the bundle's; the widget adds only
 * the counter and the "required" nudge.
 *
 * Over the limit is shown as the shopper types (they can see it and fix it). Missing is shown only
 * after they try to add, so an empty form is not a wall of red before anyone has typed a letter.
 * Nothing is cut off silently: a pasted message that is too long stays as pasted, counted, so the
 * shopper chooses what to drop.
 */
import type { BundleVariant } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct } from '../model';
import { lengthOf, limitOf, type Field } from '../personalisation';
import { fieldElementId, useAnswers, useBuilder, useSelection } from './context';
import { PenIcon } from './Icons';
import { ProductArt } from './ProductArt';

/** Above this many characters a field is a message, and gets a textarea. */
const SHORT_FIELD = 40;

function FieldInput({ product, field }: { product: ViewProduct; field: Field }) {
    const { money, content, idPrefix } = useBuilder();
    const { locked } = useSelection();
    const { answers, setAnswer, issues, showMissing } = useAnswers();
    const raw = answers[product.id]?.[field.id] ?? '';
    const id = fieldElementId(idPrefix, product.id, field.id);
    const issue = issues.find((entry) => entry.productId === product.id && entry.field.id === field.id);
    const shownIssue = issue && (issue.kind === 'too-long' || showMissing) ? issue : null;
    // Too long is the SDK's finding, and so is by how much; the counter only words it.
    const tooLong = issue?.kind === 'too-long' ? issue : null;
    const limit = limitOf(field);
    const used = lengthOf(raw);
    // A fee is stored in the shop's currency; the shopper is shown it in theirs, before they type.
    const fee = field.fee && !content.hidePrices ? money.format(money.fromShopCurrency(field.fee.amount)) : null;
    const describedBy = [field.helpText ? `${id}-help` : '', limit !== null ? `${id}-count` : '', shownIssue ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
    const common = {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': shownIssue ? true : undefined,
        'aria-required': field.required || undefined,
        readOnly: locked,
    };

    let control;
    if (field.type === 'dropdown') {
        control = (
            <select {...common} className="gft-select gft-field__control" value={raw} disabled={locked} onChange={(event) => setAnswer(product.id, field.id, event.target.value)}>
                <option value="">{text(content, 'fieldChoose')}</option>
                {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        );
    } else if (field.type === 'checkbox') {
        control = (
            <input
                {...common}
                type="checkbox"
                className="gft-field__checkbox"
                checked={raw.trim() !== ''}
                disabled={locked}
                onChange={(event) => setAnswer(product.id, field.id, event.target.checked ? 'Yes' : '')}
            />
        );
    } else if (limit !== null && limit <= SHORT_FIELD) {
        control = (
            <input
                {...common}
                type="text"
                className="gft-field__control gft-field__control--short"
                value={raw}
                placeholder={field.placeholder ?? undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setAnswer(product.id, field.id, event.target.value)}
            />
        );
    } else {
        control = (
            <textarea
                {...common}
                className="gft-field__control gft-field__control--long"
                value={raw}
                rows={4}
                placeholder={field.placeholder ?? undefined}
                onChange={(event) => setAnswer(product.id, field.id, event.target.value)}
            />
        );
    }

    return (
        <div className={`gft-field gft-field--${field.type}${shownIssue ? ' gft-field--invalid' : ''}`} data-field-key={field.key}>
            <div className="gft-field__head">
                <label className="gft-field__label" htmlFor={id}>
                    {field.label}
                </label>
                <span className={`gft-field__badge${field.required ? ' gft-field__badge--required' : ''}`}>
                    {text(content, field.required ? 'fieldRequired' : 'fieldOptional')}
                </span>
                {fee ? (
                    <span className="gft-field__fee" data-fee-value={field.fee!.amount}>
                        {text(content, 'fieldFee', { amount: fee })}
                    </span>
                ) : null}
            </div>
            {field.type === 'checkbox' ? <div className="gft-field__check">{control}</div> : control}
            <div className="gft-field__foot">
                {field.helpText ? (
                    <p className="gft-field__help" id={`${id}-help`}>
                        {field.helpText}
                    </p>
                ) : (
                    <span />
                )}
                {limit !== null ? (
                    <p className={`gft-field__count${tooLong ? ' gft-field__count--over' : ''}`} id={`${id}-count`} aria-live="polite">
                        {tooLong ? text(content, 'charactersOver', { count: tooLong.over }) : text(content, 'charactersLeft', { count: limit - used })}
                    </p>
                ) : null}
            </div>
            {shownIssue?.kind === 'missing' ? (
                <p className="gft-field__error" id={`${id}-error`}>
                    {text(content, 'fieldNeeded')}
                </p>
            ) : null}
        </div>
    );
}

/** One product's fields, with the product beside them so the shopper knows what they are writing on. */
function ProductFields({ product, variant }: { product: ViewProduct; variant: BundleVariant | undefined }) {
    const { answers } = useAnswers();
    const engraving = product.fields.find((field) => field.type === 'text' && field.characterLimit && field.characterLimit <= SHORT_FIELD);
    const inscription = engraving ? (answers[product.id]?.[engraving.id] ?? '').trim() : '';
    return (
        <div className="gft-personal__item" data-cc-personalise={product.handle}>
            <ProductArt product={product} variant={variant} inscription={inscription} width={72} className="gft-personal__art" decorative />
            <div className="gft-personal__fields">
                <p className="gft-personal__product">
                    {product.title}
                    {variant && variant.title !== 'Default Title' ? <span className="gft-personal__variant">{variant.title}</span> : null}
                </p>
                {product.fields.map((field) => (
                    <FieldInput key={field.id} product={product} field={field} />
                ))}
            </div>
        </div>
    );
}

/** The fields for every product in this list that has any, under one heading; nothing when none do. */
export function Personalise({ entries }: { entries: { product: ViewProduct; variant: BundleVariant | undefined }[] }) {
    const { content } = useBuilder();
    const withFields = entries.filter((entry) => entry.product.fields.length > 0);
    if (withFields.length === 0) return null;
    return (
        <div className="gft-personal">
            <p className="gft-personal__heading">
                <PenIcon />
                {text(content, 'personaliseHeading')}
            </p>
            {withFields.map((entry) => (
                <ProductFields key={entry.product.id} product={entry.product} variant={entry.variant} />
            ))}
        </div>
    );
}
