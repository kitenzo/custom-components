/*
 * The widget root every stage renders inside: the quiz, the routine, the wizard.
 *
 * It carries the test contract's root (`cc-root`, `data-complete`, `data-qa-count`), the theme
 * editor's problem list and the storefront's one-line "not available", so no stage can forget
 * them. The stages swap what is inside it; a stage with no selection yet (the quiz) reports a
 * count of 0 and incomplete.
 */
import type { ReactNode, RefObject } from 'react';

import { text, type Content } from '../content';
import type { ViewModel } from '../model';
import { EditorPanel } from './Notice';

interface ShellProps {
    model: ViewModel;
    content: Content;
    editor: boolean;
    complete: boolean;
    count: number;
    nudged?: boolean;
    stage: 'quiz' | 'review' | 'wizard';
    rootRef?: RefObject<HTMLDivElement>;
    children: ReactNode;
}

export function Shell({ model, content, editor, complete, count, nudged = false, stage, rootRef, children }: ShellProps) {
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    return (
        <div
            ref={rootRef}
            className={`skr-root${nudged ? ' skr-root--nudged' : ''}`}
            data-testid="cc-root"
            data-stage={stage}
            data-complete={complete ? 'true' : 'false'}
            data-qa-count={count}
        >
            {editor && model.problems.length > 0 ? (
                <EditorPanel>
                    <ul className="skr-editor-panel__list">
                        {model.problems.map((problem) => (
                            <li key={problem.detail}>{problem.detail}</li>
                        ))}
                    </ul>
                </EditorPanel>
            ) : null}
            {!editor && blockingProblem ? (
                <div className="skr-error" data-testid="cc-error" role="alert">
                    <p>{text(content, 'unavailable')}</p>
                </div>
            ) : null}
            {children}
        </div>
    );
}
