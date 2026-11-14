/**
 * 開発用: 「自分から見る」視点の向きの候補を比べる試し場（dev-hands.html?set=camlab。本番のビルドには入らない）。
 * 指文字のいくつかを、候補ごとのカメラの向きで描いて並べる（hand-r2 の課題3で視点を決めるために使った）。
 * URL: cams=yaw:pitch,yaw:pitch …（度。yaw は真上から見て +Z からの回り角、180 が真後ろ。表す人の体の中心の側が 180 より小さい）
 *      items=kana-so,kana-me … / size=150
 */
import { useEffect, useRef } from 'preact/hooks';
import { getItem } from '../../content';
import { cameraPosition, signBounds } from '../core/framing';
import { faceAt } from '../core/face';
import { compileSign, sampleSign } from '../core/timeline';
import { acquireRenderer, drawStage, releaseRenderer } from '../render/shared';
import { FOV, Stage } from '../render/stage';

const params = new URLSearchParams(location.search);
const SIZE = Number(params.get('size') ?? 150);
const CAMS = (params.get('cams') ?? '163:26,180:39,166:36,194:36,145:40,180:48,170:48,180:55')
  .split(',')
  .map((s) => s.split(':').map(Number) as [number, number]);
const ITEMS = (params.get('items') ?? 'kana-so,kana-me,kana-a,kana-ha,kana-ra,kana-sa,kana-su,kana-ki,kana-ro,kana-ne,kana-ho,kana-ta,kana-ku,kana-mu').split(',');

function Cell({ id, yaw, pitch }: { id: string; yaw: number; pitch: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const item = getItem(id);
    const canvas = ref.current;
    if (!item || !canvas || !acquireRenderer()) return;
    const spec = item.sign;
    const c = compileSign(spec);
    const stage = new Stage();
    stage.setDominant('right');
    stage.configure({ twoHands: !!c.nonDominant, body: false });
    stage.setFrame(sampleSign(c, c.duration), { progress: 1, opacity: 0 }, faceAt(spec, c.duration));
    const b = signBounds(c, 'right', false);
    stage.aim(b, 'self', 0, 0, 1);
    const p = cameraPosition(b, yaw, pitch, FOV);
    stage.camera.position.set(p[0], p[1], p[2]);
    stage.camera.lookAt(b.center[0], b.center[1], b.center[2]);
    stage.camera.updateProjectionMatrix();
    drawStage(stage, canvas, SIZE, SIZE);
    releaseRenderer();
  }, [id, yaw, pitch]);
  return <canvas ref={ref} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE, background: 'var(--c-bg)', borderRadius: 8 }} />;
}

export function CamLab() {
  useEffect(() => {
    // 描くのは同期なので、描き終わった後に印を付ける
    const t = setTimeout(() => (document.body.dataset.ready = '1'), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <main class="dev" style={{ maxWidth: 'none' }}>
      <h1>自分から見る視点の候補（開発用）</h1>
      <table data-camlab>
        <thead>
          <tr>
            <th />
            {CAMS.map(([y, p]) => (
              <th key={`${y}:${p}`}>
                {y}:{p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ITEMS.map((id) => (
            <tr key={id}>
              <th>{getItem(id)?.label ?? id}</th>
              {CAMS.map(([y, p]) => (
                <td key={`${y}:${p}`}>
                  <Cell id={id} yaw={y} pitch={p} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
