/*
 * "Switch to a smaller box?": asked, never assumed.
 *
 * A box of 6 cannot hold the 9 macarons in the tray, and quietly dropping three would lose picks
 * the shopper made on purpose. So the widget says how many would come out (the most recent, the
 * order a shopper undoes things in) and lets them choose. Escape, the backdrop and "Keep" all
 * leave the box as it was.
 *
 * A native <dialog>, like the details dialog, for the same reason: the top layer, which no theme
 * ancestor's `transform` can trap.
 */
import { useEffect, useId, useRef } from 'react';

import { text } from '../content';
import { useBuilder } from './context';

interface SwitchDialogProps {
    pending: number | null;
    current: number | null;
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
}

export function SwitchDialog({ pending, current, count, onConfirm, onCancel }: SwitchDialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const { content } = useBuilder();
    // Two sections on one page are two of these dialogs: ids must be this widget's own.
    const id = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (pending !== null && !dialog.open) dialog.showModal();
        if (pending === null && dialog.open) dialog.close();
    }, [pending]);

    const remove = pending === null ? 0 : count - pending;

    return (
        <dialog
            ref={ref}
            className="mcb-dialog mcb-dialog--confirm"
            data-testid="mcb-switch-dialog"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-body`}
            onClose={onCancel}
            onClick={(event) => {
                if (event.target === ref.current) ref.current?.close();
            }}
        >
            {pending !== null ? (
                <div className="mcb-confirm">
                    <h3 className="mcb-confirm__title" id={`${id}-title`}>
                        {text(content, 'switchTitle', { size: pending })}
                    </h3>
                    <p className="mcb-confirm__body" id={`${id}-body`}>
                        {text(content, 'switchBody', { count, size: pending, remove })}
                    </p>
                    <div className="mcb-confirm__actions">
                        <button type="button" className="mcb-button mcb-button--secondary" onClick={() => ref.current?.close()} autoFocus>
                            {text(content, 'switchCancel', { current: current ?? count })}
                        </button>
                        <button type="button" className="mcb-button mcb-button--primary" data-testid="mcb-switch-confirm" onClick={onConfirm}>
                            {text(content, 'switchConfirm', { remove })}
                        </button>
                    </div>
                </div>
            ) : null}
        </dialog>
    );
}
