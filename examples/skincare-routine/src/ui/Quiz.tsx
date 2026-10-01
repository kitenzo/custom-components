/*
 * The consultation: an introduction, then one question at a time.
 *
 * Every word is a theme setting, and so is what each answer means (the tags it matches, quiz.ts).
 * Choosing an answer moves on by itself, because a one-answer question has nothing to confirm;
 * Back goes to the previous question with its answer still marked. Answers are pressed buttons,
 * not radios: each one acts on its own, and a radio group promises arrow-key behaviour a set of
 * buttons that move on when pressed should not have. "Skip" is on every screen:
 * the quiz is a shortcut to a routine, never a gate in front of the products.
 */
import { useEffect, useId, useRef, useState } from 'react';

import { text, type Content } from '../content';
import type { ViewModel } from '../model';
import type { QuizQuestion } from '../quiz';
import type { Chosen } from './Builder';
import { ArrowIcon, BackIcon, CheckIcon } from './Icons';
import { imageAttrs } from './images';
import { Shell } from './Shell';

interface QuizProps {
    model: ViewModel;
    content: Content;
    editor: boolean;
    questions: QuizQuestion[];
    initial: Chosen;
    onFinish: (chosen: Chosen) => void;
    onSkip: () => void;
}

/** How long a chosen answer stays on screen, marked, before the next question replaces it. */
const ADVANCE_MS = 260;

export function Quiz({ model, content, editor, questions, initial, onFinish, onSkip }: QuizProps) {
    // -1 is the introduction. A retake starts there too, with the last answers still marked.
    const [index, setIndex] = useState(-1);
    const [chosen, setChosen] = useState<Chosen>(initial);
    const timer = useRef<number>();
    const headingRef = useRef<HTMLHeadingElement>(null);
    const first = useRef(true);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `skr${useId().replace(/:/g, '')}`;
    useEffect(() => () => window.clearTimeout(timer.current), []);

    // A new question is new content where the old one was: move focus to its title so a screen
    // reader announces it, as a page change would. Not on first paint, where focus is the page's.
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        headingRef.current?.focus({ preventScroll: true });
    }, [index]);

    const question = index >= 0 ? questions[index] : undefined;

    const answer = (questionId: string, answerId: string) => {
        const next = { ...chosen, [questionId]: answerId };
        setChosen(next);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            if (index >= questions.length - 1) onFinish(next);
            else setIndex(index + 1);
        }, ADVANCE_MS);
    };

    const skipButton = (
        <button
            type="button"
            className="skr-link"
            data-testid="cc-quiz-skip"
            onClick={() => {
                window.clearTimeout(timer.current);
                onSkip();
            }}
        >
            {text(content, 'quizSkip')}
        </button>
    );

    if (!question) {
        // One photograph per step, in step order: the routine the quiz is about to build.
        const photos = model.sections
            .map((section) => section.products.find((product) => !product.soldOut)?.photos[0] ?? section.products[0]?.photos[0])
            .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
            .slice(0, 3);
        return (
            <Shell model={model} content={content} editor={editor} complete={false} count={0} stage="quiz">
                <div className="skr-quiz skr-quiz--intro" data-testid="cc-quiz">
                    <div className="skr-quiz__intro">
                        <p className="skr-eyebrow">{text(content, 'quizEyebrow')}</p>
                        <h2 className="skr-display" ref={headingRef} tabIndex={-1}>
                            {text(content, 'quizHeading')}
                        </h2>
                        <p className="skr-lede">{text(content, 'quizIntro')}</p>
                        <div className="skr-quiz__actions">
                            <button type="button" className="skr-button skr-button--primary skr-button--wide" data-testid="cc-quiz-start" onClick={() => setIndex(0)}>
                                {text(content, 'quizStart')}
                                <ArrowIcon />
                            </button>
                            {skipButton}
                        </div>
                    </div>
                    {photos.length > 0 ? (
                        <div className={`skr-quiz__still skr-quiz__still--${photos.length}`} aria-hidden="true">
                            {photos.map((photo) => (
                                <img key={photo.url} {...imageAttrs(photo.url, 360)} alt="" width={360} height={360} />
                            ))}
                        </div>
                    ) : null}
                </div>
            </Shell>
        );
    }

    const progress = ((index + 1) / questions.length) * 100;
    return (
        <Shell model={model} content={content} editor={editor} complete={false} count={0} stage="quiz">
            <div className="skr-quiz" data-testid="cc-quiz" data-question={question.id}>
                <div className="skr-quiz__progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                </div>
                <div className="skr-quiz__bar">
                    <button
                        type="button"
                        className="skr-link skr-link--quiet"
                        onClick={() => {
                            // An answer still landing would otherwise move on after the shopper went back.
                            window.clearTimeout(timer.current);
                            setIndex(index - 1);
                        }}
                    >
                        <BackIcon />
                        {text(content, 'back')}
                    </button>
                    <p className="skr-eyebrow">{text(content, 'quizProgress', { current: index + 1, total: questions.length })}</p>
                </div>
                <div className="skr-quiz__question">
                    <h2 className="skr-display skr-display--question" id={`${idPrefix}-${question.id}`} ref={headingRef} tabIndex={-1}>
                        {question.title}
                    </h2>
                    {question.hint ? <p className="skr-lede">{question.hint}</p> : null}
                    <div className="skr-answers" role="group" aria-labelledby={`${idPrefix}-${question.id}`}>
                        {question.answers.map((entry) => {
                            const selected = chosen[question.id] === entry.id;
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    aria-pressed={selected}
                                    className={`skr-answer${selected ? ' skr-answer--selected' : ''}`}
                                    data-cc-answer={entry.id}
                                    onClick={() => answer(question.id, entry.id)}
                                >
                                    <span className="skr-answer__label">{entry.label}</span>
                                    <span className="skr-answer__mark" aria-hidden="true">
                                        {selected ? <CheckIcon /> : null}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="skr-quiz__footer">{skipButton}</div>
            </div>
        </Shell>
    );
}
