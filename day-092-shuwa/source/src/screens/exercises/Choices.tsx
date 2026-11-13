import type { ComponentChildren } from 'preact';
export function Choices({ options, selected, correctAnswer, answered, onSelect, render, label }: {
  options: string[]; selected: unknown; correctAnswer: string; answered: boolean;
  onSelect(value: string): void; render(value: string): ComponentChildren; label: string;
}) {
  return <div class="choices" role="group" aria-label={label}>{options.map((option, index) => <button type="button" data-shortcut={index + 1} data-option={option}
    class={`choice ${selected === option ? 'choice--selected' : ''} ${answered && option === correctAnswer ? 'choice--correct' : ''} ${answered && selected === option && option !== correctAnswer ? 'choice--wrong' : ''}`}
    aria-pressed={selected === option} disabled={answered} onClick={() => onSelect(option)}>
    <span class="choice__number" aria-hidden="true">{index + 1}</span>{render(option)}
    {!answered && selected === option && <span class="choice__selected-mark" aria-hidden="true">✓</span>}
    {answered && option === correctAnswer && <span class="choice__mark" aria-label="正解">✓</span>}
    {answered && selected === option && option !== correctAnswer && <span class="choice__mark" aria-label="まちがい">✗</span>}
  </button>)}</div>;
}
