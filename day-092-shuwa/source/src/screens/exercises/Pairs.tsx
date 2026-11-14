import { ReadableText } from '../../ui/ReadableText';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getItem } from '../../content';
import type { Exercise } from '../../engine/lesson';
import type { ExerciseProps } from './types';
import type { PairAnswer } from '../../app/lessonProgress';
import { pairMatches } from '../../app/lessonProgress';
import { Thumbnail } from '../../ui/Thumbnail';
export function Pairs({ exercise, value, onChange, answered }: ExerciseProps<Extract<Exercise, { kind: 'pairs' }>>) {
  const restored = value && typeof value === 'object' && !Array.isArray(value) ? value as PairAnswer : null;
  const [selection, setSelection] = useState<{ side: 'sign' | 'label'; id: string } | null>(null);
  const [matched, setMatched] = useState<string[]>(restored?.matched ?? []);
  const [wrong, setWrong] = useState<string[]>([]);
  const mismatch = useRef(restored?.hadMismatch ?? false);
  const mismatches = useRef<[string, string][]>(restored?.mismatches ?? []);
  const claimed = useRef<string[]>(restored?.matched ?? []);
  const selected = useRef(selection);
  const select = (value: typeof selection) => { selected.current = value; setSelection(value); };
  const [flashing, setFlashing] = useState<string[]>([]);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(timer.current); flashTimers.current.forEach(clearTimeout); }, []);
  const choose = (side: 'sign' | 'label', id: string) => {
    if (answered || claimed.current.includes(id)) return;
    const selection = selected.current;
    if (!selection || selection.side === side) { select({ side, id }); return; }
    if (pairMatches(selection.id, id)) {
      const next = [...claimed.current, id];
      claimed.current = next;
      setFlashing(current => [...current, id]);
      flashTimers.current.push(setTimeout(() => {
        setFlashing(current => current.filter(value => value !== id));
        setMatched(current => [...current, id]);
      }, 300));
      onChange({ matched: next, hadMismatch: mismatch.current, mismatches: [...mismatches.current] });
      setWrong([]);
    } else {
      mismatch.current = true;
      const pair: [string, string] = selection.side === 'sign' ? [selection.id, id] : [id, selection.id];
      if (!mismatches.current.some(([a, b]) => a === pair[0] && b === pair[1])) mismatches.current.push(pair);
      onChange({ matched: claimed.current, hadMismatch: true, mismatches: [...mismatches.current] });
      setWrong([`${selection.side}:${selection.id}`, `${side}:${id}`]);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setWrong([]), 600);
    }
    select(null);
  };
  return <><h1><ReadableText text="同じものを、ペアにしよう" /></h1><p class="small"><ReadableText text="手と文字を、ひとつずつ選んでください" /></p>
    <div class="pairs">{(['sign', 'label'] as const).map(side => <div class="pairs__column" role="group" aria-label={side === 'sign' ? '手の列' : '文字の列'}>{(side === 'sign' ? exercise.signOrder : exercise.labelOrder).map((id, index) => <button
      data-shortcut={(!selection ? side === 'sign' : side !== selection.side) ? index + 1 : undefined}
      class={`choice pair-choice ${matched.includes(id) || flashing.includes(id) ? 'pair-choice--matched choice--correct' : ''} ${flashing.includes(id) ? 'pair-choice--flash' : ''} ${selection?.side === side && selection.id === id ? 'choice--selected' : ''} ${wrong.includes(`${side}:${id}`) ? 'choice--wrong shake' : ''}`}
      aria-pressed={selection?.side === side && selection.id === id} disabled={answered || claimed.current.includes(id)}
      aria-label={matched.includes(id) || flashing.includes(id) ? `${side === 'sign' ? '手' : '文字'}の${getItem(id)?.label}、ペア完成` : undefined}
      onClick={() => choose(side, id)}>{side === 'sign' ? <Thumbnail item={getItem(id)!} size={75} /> : <span class={getItem(id)!.label.length > 1 ? 'choice__word' : 'choice__letter'}><ReadableText text={getItem(id)!.label} /></span>}{(matched.includes(id) || flashing.includes(id)) && <span class="choice__mark" aria-hidden="true">✓</span>}{selection?.side === side && selection.id === id && <span class="choice__selected-mark" aria-hidden="true">✓</span>}</button>)}</div>)}</div>
    <p class="pair-status" role="status"><ReadableText text={wrong.length ? 'おしい！ 形を見直して、もう一度選んでみよう' : matched.length === exercise.itemIds.length ? 'すべてのペアができました！' : `${matched.length} / ${exercise.itemIds.length} ペア完成`} /></p>
  </>;
}
