import { useState } from 'preact/hooks';
import { ITEMS, getItem } from '../content';
import { getSource } from '../content/sources';
import { progress } from '../app/state';
import { CATALOG_COURSES, inCourse } from '../app/recordModel';
import type { CourseId } from '../course/course';
import { Thumbnail } from '../ui/Thumbnail';
import { Mascot } from '../ui/Mascot';
import { Icon } from '../ui/icons';
import { ReadableText } from '../ui/ReadableText';
import { SourceLink } from '../ui/SourceLink';
import { mirrorText } from '../content/mirror';
import { Sign } from './exercises/Sign';

export function Dictionary() {
  const [course, setCourse] = useState<CourseId>(progress.value.settings.startCourse);
  const items = ITEMS.filter(item => inCourse(item, course));
  return <main class={`screen collection course--${course}`}><div class="page-heading"><div><p class="eyebrow"><ReadableText text="気になる形を、いつでも。" /></p><h1><ReadableText text="図鑑" /></h1></div><Mascot size={80} /></div>
    <a class="card review-card" href="#/spell"><Icon name="hand" size={32} /><span><strong><ReadableText text="ことばを指文字で再生" /></strong><small><ReadableText text="名前や好きなことばを入れてみよう" /></small></span><Icon name="arrow" /></a>
    <div class="course-tabs" role="group" aria-label="図鑑のコース">{CATALOG_COURSES.map(value => <button class={`course-tab course-tab--${value.id}`} aria-pressed={value.id === course} onClick={() => setCourse(value.id)}>{value.title}</button>)}</div>
    <p class="small"><ReadableText text={`${items.length}項目 · 学んだ段階は0〜5で表示します。`} /></p>
    {items.length ? <ul class="catalog-grid">{items.map(item => <li key={item.id} class={item.label.split('（')[0]!.length > 7 ? 'catalog-grid__wide' : ''}><a class="card catalog-item" href={`#/dict/${encodeURIComponent(item.id)}`}><Thumbnail item={item} size={96} /><CatalogLabel label={item.label} /><span class="catalog-marks"><span class="badge">{progress.value.items[item.id] ? `段階 ${progress.value.items[item.id]!.box}/5` : '未学習'}</span>{item.confidence === 'medium' && <span class="badge badge--check"><ReadableText text="資料で分かれる" /></span>}{item.confidence === 'low' && <span class="badge badge--check"><ReadableText text="参考のみ" /></span>}</span></a></li>)}</ul>
      : <div class="card empty"><Mascot expression="think" size={120} /><p><ReadableText text="このコースの教材は準備中です。" /></p></div>}
  </main>;
}

export function ItemDetail({ id }: { id: string }) {
  const item = getItem(id);
  if (!item) return <main class="screen empty"><Mascot expression="think" /><h1><ReadableText text="項目が見つかりません" /></h1><a class="button" href="#/dict"><ReadableText text="図鑑へ" /></a></main>;
  const describe = (text: string) => mirrorText(text, progress.value.settings.dominant);
  const sources = item.sources.map(getSource).filter(source => !!source);
  return <main class="screen collection item-detail"><a class="text-button back-link" href="#/dict"><ReadableText text="〈 図鑑へ" /></a><header><h1 class={`sign-label ${item.kind === 'word' ? 'sign-label--word' : ''}`}><ReadableText text={item.label} /></h1><p class="reading"><ReadableText text={(item.kind === 'word' ? item.meaning : item.reading) ?? ''} /></p></header>
    <div class="sign-detail-layout"><Sign key={item.id} item={item} />
    <section class="card prose"><h2><ReadableText text={item.kind === 'word' ? '相手から見た動き' : '相手から見た説明'} /></h2><p><ReadableText text={describe(item.describe.viewer)} /></p><h2><ReadableText text="自分で作るときのコツ" /></h2><p><ReadableText text={describe(item.describe.self)} /></p></section></div>
    {item.memory && <section class="card prose"><h2><ReadableText text={item.memory.kind === 'origin' ? '資料で確かめた由来' : '覚え方の例（由来ではありません）'} /></h2><p><ReadableText text={describe(item.memory.text)} /></p></section>}
    {!!item.confusables?.length && <section class="card prose"><h2><ReadableText text="見間違えやすい項目" /></h2><ul class="link-list">{item.confusables.map(other => { const target = getItem(other.id); return target && <li key={other.id}><a href={`#/dict/${encodeURIComponent(other.id)}`}><strong>{target.label}</strong><span><ReadableText text={describe(other.tip)} /></span><Icon name="arrow" size={20} /></a></li>; })}</ul></section>}
    <section class="card prose"><h2><ReadableText text="地域差・別の表し方" /></h2><p><ReadableText text={item.variants ?? '地域や世代によって、表し方が異なる場合があります。'} /></p></section>
    <section class="card prose"><h2><ReadableText text="出典" /></h2>{sources.length > 0 && <p class="small"><ReadableText text="リンクは新しいタブで開きます。" /></p>}{sources.length ? <ul class="source-list">{sources.map(source => <li key={source.id}><SourceLink url={source.url} title={source.title} /></li>)}</ul> : <p><ReadableText text="この項目の出典は準備中です。" /></p>}<h2><ReadableText text="確信度" /></h2><p><ReadableText text={item.confidence === 'high' ? '高い' : item.confidence === 'medium' ? '資料で分かれる' : '低い（参考のみ）'} /></p>{item.confidence === 'medium' && <p><ReadableText text="資料によって説明が分かれる字です。地域の手話講座などで確かめてください" /></p>}<p class="small"><ReadableText text="ろう者の監修は受けていません。" /></p></section>
    <a class="text-button" href="#/about"><ReadableText text="このアプリについて" /></a>
  </main>;
}

function CatalogLabel({ label }: { label: string }) {
  const parts = label.match(/^(.*?)（(.*?)）$/);
  const name = parts?.[1] ?? label;
  const note = parts?.[2];
  return <strong class={`catalog-label ${name.length > 1 ? 'catalog-label--long' : ''}`}><ReadableText text={name} />{note && <small>{note === '゛' || note === '゜' ? note === '゛' ? '濁点（゛）' : '半濁点（゜）' : `（${note}）`}</small>}</strong>;
}
