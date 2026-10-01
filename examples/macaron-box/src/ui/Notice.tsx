/*
 * The states that are not the builder: loading, a bundle that cannot load, a bundle that cannot
 * be sold.
 *
 * Every one renders inside the widget root with `cc-root` on it, so the page never goes blank and
 * a test can always find the widget. In the theme editor the merchant is told what failed and how
 * to fix it; on the storefront the shopper gets one short, neutral line. A merchant-facing reason
 * never goes to `console.warn` only: nobody reads the console of a live store.
 */
import type { ReactNode } from 'react';

import { InfoIcon } from './Icons';

export function Loading() {
    return (
        <div className="mcb-root mcb-root--state" data-testid="cc-root" data-complete="false" data-qa-count="0">
            <div className="mcb-loading" data-testid="cc-loading" role="status" aria-label="Loading">
                <span className="mcb-loading__bar" />
                <span className="mcb-loading__bar" />
                <span className="mcb-loading__bar" />
            </div>
        </div>
    );
}

export function ErrorState({ message, detail, editor }: { message: string; detail?: ReactNode; editor: boolean }) {
    return (
        <div className="mcb-root mcb-root--state" data-testid="cc-root" data-complete="false" data-qa-count="0">
            <div className="mcb-error" data-testid="cc-error" role="alert">
                <p>{message}</p>
            </div>
            {editor && detail ? <EditorPanel>{detail}</EditorPanel> : null}
        </div>
    );
}

/** Only ever rendered in the theme editor. Styled to look like Shopify's own, not like the store. */
export function EditorPanel({ children }: { children: ReactNode }) {
    return (
        <div className="mcb-editor-panel" data-testid="cc-editor-panel">
            <InfoIcon />
            <div>
                <p className="mcb-editor-panel__title">Only you can see this (theme editor)</p>
                {children}
            </div>
        </div>
    );
}
