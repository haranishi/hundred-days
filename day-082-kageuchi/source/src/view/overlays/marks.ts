// OWNER: core
// 番兵の頭上の印：「？」（溜まっていく輪つき）・「！」・「zzz」（居眠り）・「!?」（倒れた仲間に気づいた）。
// 字と輪は canvas に前もって描いておき（？は輪の溜まり具合を 16 段）、Sprite で頭の上に出す。屋根の向こうでも見えるよう深さは見ない。
import * as THREE from 'three';
import type { MarkSnap } from '../../contract/snapshot';

const STEPS = 16;
/** これより遠い印は出さない（m）。 */
const FAR_HIDE = 38;
const SIZE = 0.95;
const FONT = '"Hiragino Mincho ProN", "Yu Mincho", serif';

function makeTexture(draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  draw(g, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // canvas の上を絵の上にする（既定のまま。明示しておく）
  t.flipY = true;
  return t;
}

function backdrop(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = 'rgba(12, 10, 9, 0.62)';
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
  g.fill();
}

function glyph(g: CanvasRenderingContext2D, s: number, text: string, color: string, size: number): void {
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(10, 8, 7, 0.9)';
  g.strokeText(text, s / 2, s / 2 + size * 0.04);
  g.fillStyle = color;
  g.fillText(text, s / 2, s / 2 + size * 0.04);
}

function ring(g: CanvasRenderingContext2D, s: number, fill: number, color: string): void {
  const r = s * 0.42;
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(239, 230, 210, 0.22)';
  g.beginPath();
  g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  g.stroke();
  if (fill <= 0) return;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(s / 2, s / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
  g.stroke();
}

export class MarkLayer {
  private readonly group = new THREE.Group();
  private readonly question: THREE.CanvasTexture[] = [];
  private readonly bang: THREE.CanvasTexture;
  private readonly zzz: THREE.CanvasTexture;
  private readonly body: THREE.CanvasTexture;
  private readonly sprites = new Map<string, THREE.Sprite>();
  private readonly tmp = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    this.group.name = 'marks';
    parent.add(this.group);
    for (let i = 0; i <= STEPS; i++) {
      this.question.push(
        makeTexture((g, s) => {
          backdrop(g, s);
          ring(g, s, i / STEPS, '#e0a83a');
          glyph(g, s, '？', '#f1d68a', 66);
        }),
      );
    }
    this.bang = makeTexture((g, s) => {
      backdrop(g, s);
      ring(g, s, 1, '#c8402c');
      glyph(g, s, '！', '#ff6a4f', 72);
    });
    this.zzz = makeTexture((g, s) => {
      glyph(g, s, 'zzz', '#b9c8e8', 44);
    });
    this.body = makeTexture((g, s) => {
      backdrop(g, s);
      ring(g, s, 1, '#e0a83a');
      glyph(g, s, '!?', '#ffc35a', 58);
    });
  }

  private textureFor(m: MarkSnap): THREE.CanvasTexture {
    switch (m.kind) {
      case '!':
        return this.bang;
      case 'zzz':
        return this.zzz;
      case '!?':
        return this.body;
      default:
        return this.question[Math.max(0, Math.min(STEPS, Math.round(m.fill * STEPS)))];
    }
  }

  /** camera を渡すと、FAR_HIDE より遠い印を隠す（屋根越しに遠くの「zzz」が見えて紛らわしいので）。 */
  update(marks: readonly MarkSnap[], time: number, camera?: THREE.Camera): void {
    const seen = new Set<string>();
    for (const m of marks) {
      if (camera && camera.position.distanceTo(this.tmp.set(m.x, m.y, m.z)) > FAR_HIDE) continue;
      let sp = this.sprites.get(m.id);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, fog: false }));
        sp.renderOrder = 20;
        this.sprites.set(m.id, sp);
        this.group.add(sp);
      }
      seen.add(m.id);
      const mat = sp.material;
      const tex = this.textureFor(m);
      if (mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      // 「！」は少し脈打つ、「zzz」はゆっくり上下する
      const pulse = m.kind === '!' ? 1 + 0.08 * Math.sin(time * 12) : 1;
      const bob = m.kind === 'zzz' ? 0.08 * Math.sin(time * 1.6) : 0;
      sp.scale.set(SIZE * pulse, SIZE * pulse, 1);
      sp.position.set(m.x, m.y + bob, m.z);
      sp.visible = true;
    }
    for (const [id, sp] of this.sprites) if (!seen.has(id)) sp.visible = false;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  dispose(): void {
    for (const t of [...this.question, this.bang, this.zzz, this.body]) t.dispose();
    for (const sp of this.sprites.values()) sp.material.dispose();
    this.group.removeFromParent();
  }
}
