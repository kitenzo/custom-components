/*
 * Which stage the shopper is in: the quiz, or their routine (reviewed, or adjusted step by step).
 *
 * The routine's builder only exists once there is something to seed it with. Finishing the quiz
 * computes the routine (quiz.ts) and mounts <Routine> with it as the seed, so the builder is
 * created holding the routine and the first paint already shows it. "Skip the quiz" mounts it
 * with no seed; a basket Edit mounts it with the saved bundle and never shows the quiz, because
 * the shopper already has a routine and came back to change it. Retaking the quiz unmounts it,
 * and the next result is a new builder: answers never rewrite a selection after the fact.
 */
import { useMemo, useState } from 'react';

import type { BundleEditTarget, SavedBundleItem, SectionSelections, ShopSettings } from '@kitenzo/react';

import type { MountConfig } from '../config';
import type { ViewModel } from '../model';
import { planRoutine, quizFrom, type QuizAnswer, type RoutinePlan } from '../quiz';
import { Quiz } from './Quiz';
import { Routine } from './Routine';

export interface EditState {
    isEditing: boolean;
    selections: SectionSelections | null;
    missing: SavedBundleItem[];
    replace: BundleEditTarget | null;
}

interface BuilderProps {
    model: ViewModel;
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: EditState;
}

/** Question id → answer id: what the shopper picked, kept so "Retake" starts from it. */
export type Chosen = Record<string, string>;

export type Stage =
    | { kind: 'quiz'; chosen: Chosen }
    | {
          kind: 'routine';
          /** A new key is a new builder. */
          key: number;
          seed: SectionSelections | null;
          plan: RoutinePlan | null;
          answers: QuizAnswer[];
          chosen: Chosen;
          view: 'review' | 'wizard';
      };

export function Builder({ model, settings, config, editor, edit }: BuilderProps) {
    const questions = useMemo(() => quizFrom(config.content), [config.content]);
    const [stage, setStage] = useState<Stage>(() =>
        // A basket Edit that restored its routine opens it in the wizard. One whose saved bundle is
        // gone (`replace` is null) has nothing to adjust, so it starts at the quiz like anyone else.
        // A merchant who removed every question has no quiz: the routine starts as the wizard.
        (edit.isEditing && edit.replace) || questions.length === 0
            ? { kind: 'routine', key: 0, seed: edit.selections, plan: null, answers: [], chosen: {}, view: 'wizard' }
            : { kind: 'quiz', chosen: {} },
    );
    const nextKey = (current: Stage) => (current.kind === 'routine' ? current.key + 1 : Date.now());

    const finish = (chosen: Chosen) => {
        const answers = questions.flatMap((question) => question.answers.filter((answer) => answer.id === chosen[question.id]));
        const plan = planRoutine(model, answers);
        setStage((current) => ({ kind: 'routine', key: nextKey(current), seed: plan.selections, plan, answers, chosen, view: 'review' }));
    };
    const skip = () => setStage((current) => ({ kind: 'routine', key: nextKey(current), seed: null, plan: null, answers: [], chosen: {}, view: 'wizard' }));

    if (stage.kind === 'quiz') {
        return <Quiz model={model} content={config.content} editor={editor} questions={questions} initial={stage.chosen} onFinish={finish} onSkip={skip} />;
    }
    return (
        <Routine
            key={stage.key}
            model={model}
            settings={settings}
            config={config}
            editor={editor}
            edit={edit}
            stage={stage}
            onRetake={questions.length > 0 ? () => setStage({ kind: 'quiz', chosen: stage.chosen }) : null}
        />
    );
}
