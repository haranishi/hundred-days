/**
 * 開発用の一覧ページ（dev-hands.html。本番のビルドには入らない）。
 * 上: 操作できる表示1つ（形・利き手・動きを減らす設定を切り替える）。下: 試作の形を、相手側・自分側・左手で並べた小さな画像。
 * 撮影の自動化のため、すべての画像が出そろったら body に data-ready="1" を付ける。
 * URL の ?size=360 で画像の大きさ、?only=a,sa で表示する形を絞れる。
 * ?set=kana で src/content の全項目（指文字と変化）の一覧に切り替わる（content.tsx。view=self・rows=a,ka も使える）。
 * ?set=cards で、小さな画像を画面の札と同じ置き方で並べる（cards.tsx。hand-r3 で追加）。
 * ?set=views で、大きな表示（HandView）を最後の形で並べる（views.tsx。hand-r3 で追加。大きな表示が変わらないことの確かめ用）。
 */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import '../../ui/tokens.css';
import './dev.css';
import { HandView, renderThumbnail } from '../index';
import type { HandViewHandle, Handedness, Perspective, ThumbnailOptions } from '../types';
import { solveHandshape } from '../core/shapes';
import { compileSign } from '../core/timeline';
import { BODY_SAMPLES, SAMPLES, type Sample } from './samples';
import { ContentApp } from './content';
import { CamLab } from './cam-lab';
import { CardsApp } from './cards';
import { ViewsApp } from './views';

const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') ?? 200);
const ONLY = params.get('only')?.split(',').filter(Boolean);
const ALL = [...SAMPLES, ...BODY_SAMPLES];
const LIST = ONLY ? ALL.filter((s) => ONLY.includes(s.id)) : SAMPLES;

const VARIANTS: Array<{ key: string; title: string; opts: ThumbnailOptions; dynamicOnly?: boolean }> = [
  { key: 'viewer-right', title: '相手から（右手）', opts: { perspective: 'viewer', dominant: 'right' } },
  { key: 'self-right', title: '自分から（右手）', opts: { perspective: 'self', dominant: 'right' } },
  { key: 'viewer-left', title: '相手から（左手）', opts: { perspective: 'viewer', dominant: 'left' } },
  { key: 'self-left', title: '自分から（左手）', opts: { perspective: 'self', dominant: 'left' } },
  { key: 'viewer-right-start', title: '動き始め（相手から）', opts: { perspective: 'viewer', dominant: 'right', at: 'start' }, dynamicOnly: true },
];

let pending = 0;
const markReady = () => {
  if (pending === 0) document.body.dataset.ready = '1';
};

function Thumb({ sample, variant }: { sample: Sample; variant: (typeof VARIANTS)[number] }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    pending++;
    let alive = true;
    renderThumbnail(sample.spec, { ...variant.opts, size: SIZE }).then((u) => {
      if (alive) setUrl(u);
      pending--;
      markReady();
    });
    return () => {
      alive = false;
    };
  }, [sample.id]);
  return (
    <figure class="dev-thumb" data-variant={variant.key}>
      {url ? <img src={url} width={SIZE} height={SIZE} alt={`${sample.label} ${variant.title}`} /> : <div class="dev-thumb__wait" style={{ width: SIZE, height: SIZE }} />}
      <figcaption>{variant.title}</figcaption>
    </figure>
  );
}

function SampleCard({ sample }: { sample: Sample }) {
  const c = compileSign(sample.spec);
  const shape = sample.spec.hands.dominant.keyframes[0]?.shape;
  const solved = shape ? solveHandshape(shape) : null;
  return (
    <section class="dev-card" data-sample={sample.id}>
      <header class="dev-card__head">
        <h2>{sample.label}</h2>
        <dl>
          <dt>手のひら（r1）</dt>
          <dd>{sample.r1.palm}</dd>
          <dt>指先（r1）</dt>
          <dd>{sample.r1.fingers}</dd>
          <dt>指の関係（r1）</dt>
          <dd>{sample.r1.relation}</dd>
        </dl>
      </header>
      <div class="dev-card__thumbs">
        {VARIANTS.filter((v) => !v.dynamicOnly || !c.isStatic).map((v) => (
          <Thumb key={v.key} sample={sample} variant={v} />
        ))}
      </div>
      <p class="dev-card__meta">
        {solved?.contacts.map((r) => `接触 ${r.a}–${r.b}: 隙間 ${r.gap.toFixed(3)}`).join(' ／ ') || '接触の指定なし'}
        {c.warnings.length > 0 && <span class="dev-card__warn"> 警告: {c.warnings.join(' ／ ')}</span>}
      </p>
    </section>
  );
}

function Live() {
  const [id, setId] = useState(LIST[0]?.id ?? 'a');
  const [dominant, setDominant] = useState<Handedness>('right');
  const [perspective, setPerspective] = useState<Perspective>('viewer');
  const [reduced, setReduced] = useState(false);
  const [loop, setLoop] = useState(false);
  const [mounted, setMounted] = useState(true);
  const ref = useRef<HandViewHandle>(null);
  const sample = ALL.find((s) => s.id === id) ?? SAMPLES[0]!;
  return (
    <section class="dev-live" data-live>
      <div class="dev-live__opts">
        <label>
          形
          <select value={id} onChange={(e) => setId(e.currentTarget.value)} data-pick>
            {ALL.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={dominant === 'left'} onChange={(e) => setDominant(e.currentTarget.checked ? 'left' : 'right')} data-left />
          左利き
        </label>
        <label>
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.currentTarget.checked)} />
          動きを減らす
        </label>
        <label>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.currentTarget.checked)} />
          繰り返す
        </label>
        <button type="button" onClick={() => ref.current?.replay(1)}>
          外から replay()
        </button>
        <button type="button" onClick={() => setMounted((m) => !m)} data-unmount>
          {mounted ? '表示を外す' : '表示を戻す'}
        </button>
        <span>視点: {perspective === 'viewer' ? '相手から' : '自分から'}</span>
      </div>
      {mounted && (
      <HandView
        ref={ref}
        spec={sample.spec}
        label={`${sample.label}：${sample.r1.relation}`}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        dominant={dominant}
        size="lg"
        interactive
        loop={loop}
        reducedMotion={reduced}
      />
      )}
    </section>
  );
}

function App() {
  return (
    <main class="dev">
      <h1>3Dの手の一覧（開発用）</h1>
      <p class="dev__lead">試作の形を、相手側・自分側・左手で並べています。形の元は調査 r1（右手・相手から見た向き）。</p>
      <Live />
      <div class="dev__grid">
        {LIST.map((s) => (
          <SampleCard key={s.id} sample={s} />
        ))}
      </div>
    </main>
  );
}

const root = document.getElementById('dev');
// ?set=kana のときは src/content の全項目（指文字46文字と変化5種）を行ごとに並べる（content.tsx）。
// ?set=camlab は「自分から見る」視点の候補を比べる試し場（cam-lab.tsx）
// ?set=cards は小さな画像を画面の札と同じ置き方で並べる（cards.tsx）。?set=views は大きな表示を並べる（views.tsx）
const SET = params.get('set');
const page = SET === 'kana' ? <ContentApp /> : SET === 'camlab' ? <CamLab /> : SET === 'cards' ? <CardsApp /> : SET === 'views' ? <ViewsApp /> : <App />;
if (root) render(page, root);
