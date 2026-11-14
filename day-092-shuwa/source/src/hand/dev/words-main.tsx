/**
 * 開発用の一覧ページ（dev-words.html。本番のビルドには入らない）。数字（numbers.ts）と単語（words.ts）を並べて撮り、
 * 調査 r2 の文章（手の形・位置・向き・動き）と見比べるために使う（.agent-harness/runs/content-words/）。
 *
 * URL の指定:
 *  - set=numbers / words（既定は両方）/ shapes（単語で使う手の形だけを、手のひらを相手に向けて大きく）
 *    / thumbs（単語の小さな画像を、画面の一覧と同じ「時点の指定なし」で並べる。hand-r2 の課題4の確かめ用）
 *  - only=num-0,word-ohayou … 出す項目を絞る
 *  - size=200 … 画像の一辺
 *  - view=self … 動きのコマを自分から見た向きで描く（既定は相手から。hand-r2 の課題3の確かめ用）
 *  - times=0.35,1.33 … 動きのコマの時刻（秒）を指定する（既定は Keyframe に着く時刻。hand-r2 で一礼の時刻を確かめるために足した）
 *  - oldface=1 … hand-r2 より前の顔の決まりで描く（faceTimeline を無視して一礼は再生の始め・嫌な顔はふつうの顔）。直す前と後の比べ用
 * 数字: 相手から（右手）・自分から（右手）・相手から（左手）。動く数字は、動きの始め・途中・終わりのコマも並べる。
 * 単語: 相手から見た動きのコマ（Keyframe に着く時刻ごと。多いときは間引く）と、自分から見た始めと終わり。
 * すべての画像が出そろったら body に data-ready="1" を付ける。
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../../ui/tokens.css';
import './dev.css';
import { renderThumbnail } from '../index';
import type { SignSpec, ThumbnailOptions } from '../types';
import { compileSign } from '../core/timeline';
import { NUMBERS } from '../../content/numbers';
import { WORDS, WORD_SHAPES } from '../../content/words';
import type { SignItem } from '../../content/types';
import r2 from '../../../.agent-harness/research/r2_numbers_words.json';

const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') ?? 200);
const SET = params.get('set');
const ONLY = params.get('only')?.split(',').filter(Boolean);
const FRAME_VIEW: 'viewer' | 'self' = params.get('view') === 'self' ? 'self' : 'viewer';
const TIMES = params.get('times')?.split(',').filter(Boolean).map(Number);
const OLD_FACE = params.get('oldface') === '1';
/** hand-r2 より前の顔の決まり（比べ用）: 時刻の指定を外し、嫌な顔はふつうの顔に */
const oldFace = (s: SignSpec): SignSpec => ({ ...s, faceTimeline: undefined, face: s.face === 'frown' ? 'neutral' : s.face });

interface R2Step {
  part?: string;
  hands?: string;
  hand_shape?: string | Record<string, string>;
  start_position?: string;
  palm_orientation_observer?: string;
  fingertip_direction_observer?: string;
  movement?: string;
  nonmanual?: string;
}
interface R2Number {
  number: number;
  fingers: Record<string, string>;
  palm_orientation_observer: string;
  fingertip_direction_observer: string;
  movement: string;
}
interface R2Word {
  word: string;
  steps: R2Step[];
}
const R2 = r2 as unknown as { numbers: R2Number[]; words: R2Word[] };

function researchLines(item: SignItem): Array<[string, string]> {
  if (item.kind === 'number') {
    const n = R2.numbers.find((x) => String(x.number) === item.label);
    if (!n) return [];
    const fingers = Object.entries(n.fingers).map(([k, v]) => `${k}：${v}`).join('／');
    return [
      ['指（r2）', fingers],
      ['手のひら（r2）', n.palm_orientation_observer],
      ['指先（r2）', n.fingertip_direction_observer],
      ['動き（r2）', n.movement],
    ];
  }
  const w = R2.words.find((x) => x.word.startsWith(item.label));
  if (!w) return [];
  return w.steps.map((s, i): [string, string] => [
    `${i + 1}. ${s.part ?? ''}（r2）`,
    [
      s.hands,
      typeof s.hand_shape === 'string' ? s.hand_shape : '',
      `位置：${s.start_position ?? ''}`,
      `手のひら：${s.palm_orientation_observer ?? ''}`,
      `動き：${s.movement ?? ''}`,
      s.nonmanual ? `顔：${s.nonmanual}` : '',
    ]
      .filter(Boolean)
      .join('／'),
  ]);
}

/** 相手から見たコマの時刻: 形・向き・位置が変わる Keyframe に着く時刻（多いときは max 枚に間引く） */
function frameTimes(spec: SignSpec, max = 8): number[] {
  const c = compileSign(spec);
  const ts = new Set<number>([0, c.duration]);
  for (const tr of [spec.hands.dominant, spec.hands.nonDominant]) {
    for (const k of tr?.keyframes ?? []) if (k.shape || k.orient || k.pos) ts.add(k.t);
  }
  const all = [...ts].sort((a, b) => a - b);
  if (all.length <= max) return all;
  return Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]!);
}

let pending = 0;
const markReady = () => {
  if (pending === 0) document.body.dataset.ready = '1';
};

function Thumb({ spec, opts, title }: { spec: SignSpec; opts: ThumbnailOptions; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    pending++;
    let alive = true;
    renderThumbnail(spec, { ...opts, size: SIZE }).then((u) => {
      if (alive) setUrl(u);
      pending--;
      markReady();
    });
    return () => {
      alive = false;
    };
  }, [title]);
  return (
    <figure class="dev-thumb">
      {url ? <img src={url} width={SIZE} height={SIZE} alt={title} /> : <div class="dev-thumb__wait" style={{ width: SIZE, height: SIZE }} />}
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function Card({ item }: { item: SignItem }) {
  const c = compileSign(item.sign);
  const isWord = item.kind === 'word';
  const times = c.isStatic ? [] : TIMES ?? frameTimes(item.sign);
  return (
    <section class="words-card" data-item={item.id}>
      <header class="words-card__head">
        <h2>{item.label}</h2>
        <span class="words-card__id">{item.id}</span>
        <span class={`words-card__badge words-card__badge--${item.confidence}`}>確信度 {item.confidence}</span>
        {isWord && <span class="words-card__badge">表情 {item.sign.face ?? 'neutral'}</span>}
        {!c.isStatic && <span class="words-card__badge">{c.duration.toFixed(2)} 秒</span>}
      </header>
      <dl class="words-card__text">
        <dt>相手から見た説明</dt>
        <dd>{item.describe.viewer}</dd>
        {researchLines(item).map(([k, v]) => (
          <>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </>
        ))}
      </dl>
      {c.warnings.length > 0 && <p class="words-card__warn">警告: {c.warnings.join(' ／ ')}</p>}
      {c.isStatic ? (
        <div class="words-card__row">
          <Thumb spec={item.sign} opts={{ perspective: 'viewer', dominant: 'right' }} title="相手から（右手）" />
          <Thumb spec={item.sign} opts={{ perspective: 'self', dominant: 'right' }} title="自分から（右手）" />
          <Thumb spec={item.sign} opts={{ perspective: 'viewer', dominant: 'left' }} title="相手から（左手）" />
        </div>
      ) : (
        <>
          <p class="words-card__rowtitle">{FRAME_VIEW === 'self' ? '自分から' : '相手から'}（右手）：動きの順</p>
          <div class="words-card__row">
            {times.map((t) => (
              <Thumb key={t} spec={item.sign} opts={{ perspective: FRAME_VIEW, dominant: 'right', at: t }} title={`${t.toFixed(2)} 秒`} />
            ))}
          </div>
          <p class="words-card__rowtitle">自分から（右手）・相手から（左手）</p>
          <div class="words-card__row">
            <Thumb spec={item.sign} opts={{ perspective: 'self', dominant: 'right', at: 'start' }} title="自分から 始め" />
            <Thumb spec={item.sign} opts={{ perspective: 'self', dominant: 'right', at: 'end' }} title="自分から 終わり" />
            <Thumb spec={item.sign} opts={{ perspective: 'viewer', dominant: 'left', at: 'end' }} title="相手から（左手） 終わり" />
          </div>
        </>
      )}
    </section>
  );
}

/** 単語で使う手の形（WORD_SHAPES）を、動きなしで並べる（形だけを大きく確かめるため） */
function shapeItems(): SignItem[] {
  return Object.entries(WORD_SHAPES).map(([name, shape]) => ({
    id: `shape-${name}`,
    kind: 'word',
    label: name,
    sign: { hands: { dominant: { keyframes: [{ t: 0, shape, orient: { palm: 'toViewer', fingers: 'up' }, pos: { at: 'neutral' } }] } } },
    describe: { viewer: '（手の形の確認用。手のひらを相手に向けて置いた形）', self: '' },
    sources: [],
    confidence: 'high',
    dynamic: false,
  }));
}

/**
 * 単語の小さな画像を、画面の一覧（src/ui/Thumbnail.tsx）と同じく時点を指定せずに描いて並べる。
 * 相手から（右手）を主に、自分から（右手）も添える。撮影の道具は img を1枚ずつ撮り、どの2つも同じに見えないかを比べる
 */
function ThumbsApp() {
  return (
    <main class="dev">
      <h1>単語の小さな画像（時点の指定なし・開発用）</h1>
      <p class="dev__lead">renderThumbnail(sign, {'{ dominant }'}) の既定の時点で描いた画像。画面の一覧に出るのと同じもの。</p>
      <div class="words-card__row" data-thumbs="viewer">
        {WORDS.map((w) => (
          <div data-item={w.id} key={w.id}>
            <Thumb spec={w.sign} opts={{ dominant: 'right' }} title={w.label} />
          </div>
        ))}
      </div>
      <p class="words-card__rowtitle">自分から（右手）</p>
      <div class="words-card__row" data-thumbs="self">
        {WORDS.map((w) => (
          <div data-self-item={w.id} key={w.id}>
            <Thumb spec={w.sign} opts={{ perspective: 'self', dominant: 'right' }} title={`${w.label}（自分から）`} />
          </div>
        ))}
      </div>
    </main>
  );
}

function App() {
  if (SET === 'thumbs') return <ThumbsApp />;
  if (SET === 'shapes') {
    return (
      <main class="dev">
        <h1>単語で使う手の形（開発用）</h1>
        <div class="dev__grid">
          {shapeItems().map((i) => (
            <Card key={i.id} item={i} />
          ))}
        </div>
      </main>
    );
  }
  const all = [...(SET === 'words' ? [] : NUMBERS), ...(SET === 'numbers' ? [] : WORDS)].map((i) => (OLD_FACE ? { ...i, sign: oldFace(i.sign) } : i));
  const list = ONLY ? all.filter((i) => ONLY.includes(i.id)) : all;
  return (
    <main class="dev">
      <h1>数字と単語の一覧（開発用）</h1>
      <p class="dev__lead">描いた形と動きを、調査 r2 の文章と見比べるためのページ。数字は表（神奈川県 p.15・前橋市 p.12）とも見比べる。</p>
      <div class="dev__grid">
        {list.map((i) => (
          <Card key={i.id} item={i} />
        ))}
      </div>
    </main>
  );
}

const root = document.getElementById('dev');
if (root) render(<App />, root);
