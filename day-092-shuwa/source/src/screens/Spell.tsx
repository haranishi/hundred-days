import { ReadableText } from '../ui/ReadableText';
import { useEffect, useRef, useState } from 'preact/hooks';
import { HandView } from '../hand';
import type { HandViewHandle } from '../hand';
import { playbackDelay, playbackTokens } from '../app/spellModel';
import { progress, reducedMotion } from '../app/state';
import { Button } from '../ui/Button';
import { Mascot } from '../ui/Mascot';

export function Spell() {
  const [input, setInput] = useState('');
  const [text, setText] = useState('');
  const [position, setPosition] = useState(-1);
  const [slow, setSlow] = useState(false);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLElement>(null);
  useEffect(() => { if (text) player.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }); }, [text, run]);
  const hand = useRef<HandViewHandle>(null);
  const tokens = playbackTokens(text);
  const available = tokens.flatMap((token, index) => token.spec ? [index] : []);
  const current = tokens[position];
  const missing = [...new Set(tokens.filter(token => !token.spec).map(token => token.token.char))];
  useEffect(() => {
    if (slow && current?.spec) hand.current?.replay(0.5);
  }, [position, run, slow]);
  useEffect(() => {
    if (!playing || reducedMotion.value || !current?.spec) return;
    const timer = setTimeout(() => {
      const next = available.find(index => index > position);
      if (next === undefined) setPlaying(false); else setPosition(next);
    }, playbackDelay(current.spec, slow));
    return () => clearTimeout(timer);
  }, [text, position, playing, slow, run, reducedMotion.value]);
  const start = (value: string) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const next = playbackTokens(value);
    setText(value); setPosition(next.findIndex(token => !!token.spec)); setRun(run + 1); setPlaying(!reducedMotion.value);
  };
  return <main class="screen collection spell-screen"><a class="text-button back-link" href="#/dict"><ReadableText text="〈 図鑑へ" /></a><h1><ReadableText text="ことばを指文字で再生" /></h1><p><ReadableText text="ひらがな・カタカナを" /><br /><ReadableText text="20文字まで入れられます。" /></p>
    <form class="card option-stack" onSubmit={event => { event.preventDefault(); start(input); }}><label for="spell-input"><ReadableText text="再生することば" /></label><input id="spell-input" class="text-input" value={input} maxLength={20} placeholder="例：あい" onInput={event => setInput(Array.from(event.currentTarget.value).slice(0, 20).join(''))} /><p class="small">{Array.from(input).length} / 20文字</p><Button type="submit" disabled={!input.trim()}><ReadableText text="指文字で再生" /></Button></form>
    {!!text && <section ref={player} class="card spell-player" aria-label="指文字の再生">
      <div class="spell-text" role="group" aria-label="再生する文字。押すとその文字を表示します">{tokens.map((entry, index) => <button key={`${index}-${entry.token.char}`} class={`spell-character ${!entry.spec ? 'spell-character--missing' : ''}`} disabled={!entry.spec} aria-current={position === index ? 'step' : undefined} aria-label={`${entry.token.char}${!entry.spec ? '（未収録）' : ''}`} onClick={() => { setPosition(index); setPlaying(false); setRun(run + 1); }}>{entry.token.char}</button>)}</div>
      <div class="small" role="status" aria-live="polite">{current?.spec ? `${position + 1}文字目「${current.token.char}」${!playing ? '・停止中' : ''}` : '再生できる指文字がありません。'}{reducedMotion.value && <p><ReadableText text="動きを減らしています。文字を押すと順に確かめられます。" /></p>}</div>
      {current?.spec && <HandView ref={hand} key={`${run}-${position}`} spec={current.spec} label={`「${current.token.char}」の指文字`} interactive controls="view" autoplay reducedMotion={reducedMotion.value} dominant={progress.value.settings.dominant} size="lg" />}
      {!!available.length && <div class="playback"><Button secondary onClick={() => start(text)}><ReadableText text="はじめから" /></Button><button class="text-button" aria-pressed={slow} onClick={() => { setSlow(!slow); start(text); }}><ReadableText text="ゆっくり" /></button>{!reducedMotion.value && <button class="text-button" aria-pressed={!playing} onClick={() => setPlaying(!playing)}>{playing ? '文字送りを止める' : '文字送りをつづける'}</button>}</div>}
      {!!missing.length && <div class="notice-box" role="status">{missing.map(char => <p key={char}><ReadableText text={`『${char}』は指文字が無いので飛ばします`} /></p>)}</div>}
    </section>}
    {!text && <div class="spell-hint"><Mascot size={120} /><p><ReadableText text="あなたの名前は、どんな形かな？" /></p></div>}
  </main>;
}
