/**
 * 開発用の一覧ページの「中身」版（dev-hands.html?set=kana）。src/content の全項目を行（あ行・か行…）ごとに並べる。
 * 目視の照合（.agent-harness/runs/content-kana/）で、行ごとに撮って指文字表と見比べるために使う。本番のビルドには入らない。
 *
 * URL の指定:
 *  - view=viewer（既定）/ self / both … 相手から・自分から・両方
 *  - rows=a,ka,mod,compose … 出す行を絞る（行の名前は先頭の文字のローマ字。mod＝変化5種、compose＝合成の例）
 *  - size=200 … 画像の一辺
 * 動きのある項目は、動き始め・途中・終わりの3枚を並べる。すべての画像が出そろったら body に data-ready="1" を付ける。
 */
import { useEffect, useState } from 'preact/hooks';
import { getItem, ITEMS } from '../../content';
import type { SignItem } from '../../content';
import { fingerspellTokens, tokenSpec } from '../../content/spell';
import { KANA_ROWS } from '../../course/course';
import { renderThumbnail } from '../index';
import type { SignSpec, ThumbnailOptions } from '../types';
import { solveHandshape } from '../core/shapes';
import { compileSign } from '../core/timeline';
import { EXPERIMENTS } from './experiments';

const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') ?? 200);
const VIEW = (params.get('view') ?? 'viewer') as 'viewer' | 'self' | 'both';
const ROWS = params.get('rows')?.split(',').filter(Boolean);

interface Entry {
  key: string;
  label: string;
  note: string;
  confidence?: SignItem['confidence'];
  spec: SignSpec;
}

const fromItem = (item: SignItem): Entry => ({
  key: item.id,
  label: item.label,
  note: item.describe.viewer,
  confidence: item.confidence,
  spec: item.sign,
});

/** 合成（compose.ts）を確かめる例。濁音・半濁音・小さい字・のばす音 */
const COMPOSE_EXAMPLES = ['が', 'じ', 'ざ', 'だ', 'ば', 'ぱ', 'ぴ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ー'];

function groups(): Array<{ key: string; title: string; entries: Entry[] }> {
  const out: Array<{ key: string; title: string; entries: Entry[] }> = [];
  for (const row of KANA_ROWS) {
    const key = row[0]!.replace('kana-', '');
    const entries = row.map((id) => getItem(id)).filter((i): i is SignItem => !!i).map(fromItem);
    out.push({ key, title: `${entries[0]?.label ?? key}行`, entries });
  }
  out.push({ key: 'mod', title: '変化5種（各項目の例）', entries: ITEMS.filter((i) => i.kind === 'modifier').map(fromItem) });
  if (EXPERIMENTS.length > 0) out.push({ key: 'exp', title: '候補の比較（experiments.ts）', entries: EXPERIMENTS });
  out.push({
    key: 'compose',
    title: '合成の例（tokenSpec）',
    entries: COMPOSE_EXAMPLES.flatMap((ch) => {
      const token = fingerspellTokens(ch)[0];
      const spec = token && tokenSpec(token);
      return spec ? [{ key: `compose-${ch}`, label: ch, note: `${token.base ?? ''} + ${token.modifier ?? ''}`, spec }] : [];
    }),
  });
  return ROWS ? out.filter((g) => ROWS.includes(g.key)) : out;
}

let pending = 0;
const markReady = () => {
  if (pending === 0) document.body.dataset.ready = '1';
};

function Thumb({ spec, opts, title, id }: { spec: SignSpec; opts: ThumbnailOptions; title: string; id: string }) {
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
  }, [id]);
  return (
    <figure class="dev-thumb">
      {url ? <img src={url} width={SIZE} height={SIZE} alt={title} /> : <div class="dev-thumb__wait" style={{ width: SIZE, height: SIZE }} />}
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function variants(spec: SignSpec): Array<{ key: string; title: string; opts: ThumbnailOptions }> {
  const c = compileSign(spec);
  const out: Array<{ key: string; title: string; opts: ThumbnailOptions }> = [];
  const views: Array<'viewer' | 'self'> = VIEW === 'both' ? ['viewer', 'self'] : [VIEW];
  for (const v of views) {
    const name = v === 'viewer' ? '相手から' : '自分から';
    if (c.isStatic) {
      out.push({ key: `${v}-end`, title: name, opts: { perspective: v, dominant: 'right' } });
      continue;
    }
    out.push({ key: `${v}-start`, title: `${name}・始め`, opts: { perspective: v, dominant: 'right', at: 'start' } });
    out.push({ key: `${v}-mid`, title: `${name}・途中`, opts: { perspective: v, dominant: 'right', at: c.duration / 2 } });
    out.push({ key: `${v}-end`, title: `${name}・終わり`, opts: { perspective: v, dominant: 'right' } });
  }
  return out;
}

function Card({ entry }: { entry: Entry }) {
  const c = compileSign(entry.spec);
  const shapes = entry.spec.hands.dominant.keyframes.flatMap((k) => (k.shape ? [solveHandshape(k.shape)] : []));
  const contacts = shapes.flatMap((s) => s.contacts.map((r) => `${r.a}–${r.b} ${r.gap.toFixed(3)}`));
  return (
    <section class="dev-card dev-card--content" data-item={entry.key}>
      <header class="dev-card__head">
        <h2>{entry.label}</h2>
        <div>
          <p class="dev-card__id">
            {entry.key}
            {entry.confidence && <span class={`dev-badge dev-badge--${entry.confidence}`}>{entry.confidence}</span>}
            {!c.isStatic && <span class="dev-badge">動き</span>}
          </p>
          <p class="dev-card__note">{entry.note}</p>
        </div>
      </header>
      <div class="dev-card__thumbs">
        {variants(entry.spec).map((v) => (
          <Thumb key={v.key} id={`${entry.key}-${v.key}`} spec={entry.spec} opts={v.opts} title={v.title} />
        ))}
      </div>
      <p class="dev-card__meta">
        {contacts.length > 0 ? `接触の隙間: ${contacts.join(' ／ ')}` : '接触の指定なし'}
        {c.warnings.length > 0 && <span class="dev-card__warn"> 警告: {c.warnings.join(' ／ ')}</span>}
      </p>
    </section>
  );
}

export function ContentApp() {
  // 画像が1枚も無い指定（候補が空の rows=exp など）でも、撮影の道具が待ち続けないよう準備完了の印を付ける。
  // 子の Thumb の useEffect が先に pending を数えるので、画像があるときはここでは付かない
  useEffect(() => markReady(), []);
  return (
    <main class="dev dev--content">
      <h1>指文字の一覧（開発用・照合用）</h1>
      <p class="dev__lead">
        src/content の全項目を、右手・{VIEW === 'self' ? '自分から' : VIEW === 'both' ? '相手からと自分から' : '相手から'}見た向きで並べています。
      </p>
      {groups().map((g) => (
        <section class="dev-row" data-row={g.key} key={g.key}>
          <h2 class="dev-row__title">{g.title}</h2>
          <div class="dev-row__cards">
            {g.entries.map((e) => (
              <Card key={e.key} entry={e} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
