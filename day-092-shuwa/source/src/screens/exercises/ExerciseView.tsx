import type { ExerciseProps } from './types';
import { Intro } from './Intro';
import { SignToLabel } from './SignToLabel';
import { LabelToSign } from './LabelToSign';
import { WordMeaning } from './WordMeaning';
import { Pairs } from './Pairs';
import { ReadFingerspelling } from './ReadFingerspelling';
import { SpellWord } from './SpellWord';
import { TryIt } from './TryIt';
export function ExerciseView(props: ExerciseProps & { onSuccess(camera: boolean): void; onSkip(): void }) {
  const exercise = props.exercise;
  switch (exercise.kind) {
    case 'intro': return <Intro {...props} exercise={exercise} />;
    case 'signToLabel': return <SignToLabel {...props} exercise={exercise} />;
    case 'labelToSign': return <LabelToSign {...props} exercise={exercise} />;
    case 'wordMeaning': return <WordMeaning {...props} exercise={exercise} />;
    case 'pairs': return <Pairs {...props} exercise={exercise} />;
    case 'readFingerspelling': return <ReadFingerspelling {...props} exercise={exercise} />;
    case 'spellWord': return <SpellWord {...props} exercise={exercise} />;
    case 'tryIt': return <TryIt {...props} exercise={exercise} />;
  }
}
