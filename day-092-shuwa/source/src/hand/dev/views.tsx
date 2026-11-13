/**
 * 開発用：大きな表示（HandView）を、再生せずに最後の形で並べる（dev-hands.html?set=views。本番のビルドには入らない）。
 * hand-r3 で、小さな画像だけを直して大きな表示の見え方が変わらないことを、直す前と後の画素の比べで確かめるために足した。
 * URL の指定: ids=kana-a,word-ohayou（既定は下の DEFAULT_IDS）・view=viewer / self / both（既定 both）・size=sm / md / lg（既定 md）
 * すべての表示が描き終えたら body に data-ready="1" を付ける（描き終えたかは、キャンバスに色のある画素があるかで見る）。
 */
import { useEffect } from 'preact/hooks';
import { getItem } from '../../content';
import { HandView } from '../index';
import type { Perspective } from '../types';

const params = new URLSearchParams(location.search);
const DEFAULT_IDS = [
  'kana-a', 'kana-ku', 'kana-ma', 'kana-so', 'kana-no', 'kana-n', 'kana-ha', 'kana-me', 'kana-wo',
  'mod-dakuon', 'mod-handakuon', 'mod-chouon', 'num-7', 'num-1000',
  'word-ohayou', 'word-arigatou', 'word-sayounara', 'word-hajimemashite', 'word-daijoubu',
];
const IDS = params.get('ids')?.split(',').filter(Boolean) ?? DEFAULT_IDS;
const VIEWS: Perspective[] = params.get('view') === 'viewer' ? ['viewer'] : params.get('view') === 'self' ? ['self'] : ['viewer', 'self'];
const SIZE = (params.get('size') ?? 'md') as 'sm' | 'md' | 'lg';

export function ViewsApp() {
  useEffect(() => {
    // 全部のキャンバスに何か描かれたら準備完了（描画の部分は遅れて読み込むので、少しずつ見に行く）
    let n = 0;
    const timer = setInterval(() => {
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.hand-view__canvas')];
      const drawn = canvases.filter((c) => {
        if (c.width < 2) return false;
        const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
        if (!d) return false;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i]! > 0) return true;
        return false;
      });
      if ((canvases.length > 0 && drawn.length === canvases.length) || ++n > 600) {
        clearInterval(timer);
        document.body.dataset.ready = '1';
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <main class="dev">
      <h1>大きな表示（HandView）の最後の形（開発用）</h1>
      <div class="dev-views">
        {IDS.flatMap((id) => {
          const item = getItem(id);
          if (!item) return [];
          return VIEWS.map((v) => (
            <figure class="dev-view" data-view-item={`${id}__${v}`} key={`${id}-${v}`}>
              <HandView spec={item.sign} label={item.label} perspective={v} autoplay={false} reducedMotion size={SIZE} />
              <figcaption>
                {item.label}・{v === 'viewer' ? '相手から' : '自分から'}
              </figcaption>
            </figure>
          ));
        })}
      </div>
    </main>
  );
}
