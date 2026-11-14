/**
 * 開発用：小さな画像を画面の札と同じ置き方で並べる（dev-hands.html?set=cards。本番のビルドには入らない）。
 * 画面の Thumbnail（src/ui/Thumbnail.tsx）と同じく、時点を指定せず「表示の一辺×2」の画素で描き、角を丸めて白い札の中に置く。
 * hand-r3 で、袖が札の中で直線に切れて見えないか・大きさと位置がそろうかを、指文字・変化・合成の例・数字・単語の全部で見比べるために足した。
 *
 * URL の指定:
 *  - size=96 … 小さな画像の表示の一辺（CSS の px。描く画素はその2倍）。図鑑は 96、問題の札は 140・88・72・56
 *  - rows=kana,mod,compose,num,word … 出す組を絞る
 *  - view=self … 自分から見た向き（既定は相手から。画面の札は相手から）
 *  - left=1 … 左利き
 *  - bg=soft … 札の地を選んだ時の薄い青にする（透ける部分の確かめ用）
 *  - fade=0.12 … 縁でぼかす幅（画像の一辺に対する割合。0 でぼかさない）を変えて見比べる（開発時だけ効く。既定は render/runtime.ts の THUMB_EDGE_FADE）
 * すべての画像が出そろったら body に data-ready="1" を付ける。
 */
import { useEffect, useState } from 'preact/hooks';
import { ITEMS } from '../../content';
import { fingerspellTokens, tokenSpec } from '../../content/spell';
import { renderThumbnail } from '../index';
import type { Handedness, Perspective, SignSpec } from '../types';

const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') ?? 96);
const ROWS = params.get('rows')?.split(',').filter(Boolean);
const VIEW: Perspective = params.get('view') === 'self' ? 'self' : 'viewer';
const DOMINANT: Handedness = params.get('left') === '1' ? 'left' : 'right';
const BG = params.get('bg') === 'soft' ? 'var(--c-primary-soft)' : 'var(--c-surface)';
const FADE = params.get('fade');
if (FADE !== null) (globalThis as { __handThumbEdgeFade?: number }).__handThumbEdgeFade = Number(FADE);

/** 合成の例（compose.ts）。濁音・半濁音・促音・小さい字 */
const COMPOSE = ['が', 'じ', 'ざ', 'だ', 'ば', 'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぉ'];

interface Entry {
  key: string;
  label: string;
  spec: SignSpec;
}

function groups(): Array<{ key: string; title: string; entries: Entry[] }> {
  const of = (kind: string) => ITEMS.filter((i) => i.kind === kind).map((i) => ({ key: i.id, label: i.label.split('（')[0]!, spec: i.sign }));
  const out = [
    { key: 'kana', title: '指文字', entries: of('kana') },
    { key: 'mod', title: '変化', entries: of('modifier') },
    {
      key: 'compose',
      title: '合成の例',
      entries: COMPOSE.flatMap((ch) => {
        const t = fingerspellTokens(ch)[0];
        const spec = t && tokenSpec(t);
        return spec ? [{ key: `compose-${ch}`, label: ch, spec }] : [];
      }),
    },
    { key: 'num', title: '数字', entries: of('number') },
    { key: 'word', title: '単語', entries: of('word') },
  ];
  return ROWS ? out.filter((g) => ROWS.includes(g.key)) : out;
}

let pending = 0;
const markReady = () => {
  if (pending === 0) document.body.dataset.ready = '1';
};

function Card({ entry }: { entry: Entry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    pending++;
    let alive = true;
    renderThumbnail(entry.spec, { perspective: VIEW, dominant: DOMINANT, size: SIZE * 2 }).then((u) => {
      if (alive) setUrl(u);
      pending--;
      markReady();
    });
    return () => {
      alive = false;
    };
  }, [entry.key]);
  return (
    <div class="dev-tcard" data-card={entry.key} style={{ background: BG }}>
      <span class="dev-tcard__thumb" style={{ width: SIZE, height: SIZE }}>
        {url && <img src={url} width={SIZE} height={SIZE} alt={entry.label} />}
      </span>
      <strong>{entry.label}</strong>
    </div>
  );
}

export function CardsApp() {
  useEffect(() => markReady(), []);
  return (
    <main class="dev dev--cards">
      <h1>小さな画像を札に置いた見え方（開発用）</h1>
      <p class="dev__lead">
        表示 {SIZE}px（描く画素 {SIZE * 2}）・{VIEW === 'self' ? '自分から' : '相手から'}・{DOMINANT === 'left' ? '左手' : '右手'}。画面の Thumbnail と同じ呼び方で描いています。
      </p>
      {groups().map((g) => (
        <section class="dev-tgroup" data-group={g.key} key={g.key}>
          <h2>{g.title}</h2>
          <div class="dev-tgroup__cards">
            {g.entries.map((e) => (
              <Card key={e.key} entry={e} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
