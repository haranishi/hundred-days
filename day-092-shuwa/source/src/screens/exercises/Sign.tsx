import { ReadableText } from '../../ui/ReadableText';
import type { SignItem } from '../../content/types';
import { mirrorText } from '../../content/mirror';
import { HandView } from '../../hand';
import type { HandViewProps } from '../../hand';
import { progress, reducedMotion } from '../../app/state';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
export const WordNoticeContext = createContext<{ shown: boolean; markShown(): void } | null>(null);
export function Sign({ item, ...props }: { item: SignItem } & Partial<HandViewProps>) {
  const [perspective, setPerspective] = useState(props.perspective ?? 'viewer');
  const notice = useContext(WordNoticeContext);
  const [noticeOpen, setNoticeOpen] = useState(item.kind === 'word' && (!notice || !notice.shown));
  useEffect(() => { if (item.kind === 'word') notice?.markShown(); }, [item.id]);
  return <div class={`sign-display sign-display--${item.kind}`}>
    <HandView spec={item.sign} label={mirrorText(item.describe[perspective], progress.value.settings.dominant)} dominant={progress.value.settings.dominant} reducedMotion={reducedMotion.value} interactive autoplay={item.dynamic} loop={item.dynamic} size="lg" {...props} perspective={perspective} onPerspectiveChange={value => { setPerspective(value); props.onPerspectiveChange?.(value); }} />
    {item.kind === 'word' && <><button class="icon-button sign-info" aria-label="表情と体の動きについて" aria-expanded={noticeOpen} onClick={() => setNoticeOpen(!noticeOpen)}>i</button>
      {noticeOpen && <p class="small sign-notice"><ReadableText text="表情や体の動きも意味を持ちます。手の動きの目安として見てください" /></p>}</>}
  </div>;
}
