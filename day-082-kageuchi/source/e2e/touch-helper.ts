// OWNER: core
// E2E の指：本物のタッチを送る。2026-11-03 スマホ対応で新設。
//   Chromium：CDP の Input.dispatchTouchEvent（ブラウザが本物の pointer イベント pointerType=touch を作る）。
//             複数の指：touchStart・touchMove は触れている全部の点を送り、touchEnd は離す点だけを送る（CDP の決まり。実測）。
//   WebKit など CDP が無いとき：document.elementFromPoint の要素へ PointerEvent（pointerType=touch・指ごとの pointerId）を送る代替。
//   synthetic: true を渡すと、Chromium でも代替を使う（初回タッチでの切り替えの試験など、タッチ非対応の設定で開くとき）。
import type { CDPSession, Page } from '@playwright/test';

interface Point {
  x: number;
  y: number;
}

export class Fingers {
  private readonly pts = new Map<number, Point>();
  /** 他に触れている指が無いときに触れた指（本物のタッチの isPrimary と同じ決まり）。 */
  private readonly primary = new Set<number>();

  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession | null,
  ) {}

  static async create(page: Page, opts: { synthetic?: boolean } = {}): Promise<Fingers> {
    const name = page.context().browser()?.browserType().name();
    if (name === 'chromium' && !opts.synthetic) {
      try {
        return new Fingers(page, await page.context().newCDPSession(page));
      } catch {
        // CDP が使えないときは代替へ
      }
    }
    return new Fingers(page, null);
  }

  get real(): boolean {
    return this.cdp !== null;
  }

  private points(): { x: number; y: number; id: number; radiusX: number; radiusY: number; force: number }[] {
    return [...this.pts].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }));
  }

  private async synth(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', id: number, p: Point): Promise<void> {
    await this.page.evaluate(
      ({ type, id, x, y, primary }) => {
        // 押した要素を覚え、動き・離すはその要素へ送る（本物の pointer capture に近い）。window へは泡で届く
        const w = window as unknown as { __synthTargets?: Map<number, Element> };
        w.__synthTargets ??= new Map();
        let target: Element | null;
        if (type === 'pointerdown') {
          target = document.elementFromPoint(x, y) ?? document.body;
          w.__synthTargets.set(id, target);
        } else target = w.__synthTargets.get(id) ?? document.elementFromPoint(x, y) ?? document.body;
        const downTarget = type === 'pointerup' ? w.__synthTargets.get(id) : undefined;
        if (type === 'pointerup' || type === 'pointercancel') w.__synthTargets.delete(id);
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 100 + id,
            pointerType: 'touch',
            isPrimary: primary,
            clientX: x,
            clientY: y,
            button: type === 'pointermove' ? -1 : 0,
            buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
            width: 8,
            height: 8,
            pressure: type === 'pointerup' || type === 'pointercancel' ? 0 : 0.5,
          }),
        );
        // 本物のタップと同じく、押した所で離したら click も送る（画面のボタンは click で動く。A2 追加：WebKit の試験で画面を進めるため）
        if (type === 'pointerup' && downTarget === target && target instanceof HTMLElement) target.click();
      },
      { type, id, x: p.x, y: p.y, primary: this.primary.has(id) },
    );
  }

  async down(id: number, x: number, y: number): Promise<void> {
    if (this.pts.size === 0) this.primary.add(id);
    this.pts.set(id, { x, y });
    if (this.cdp) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points() });
    else await this.synth('pointerdown', id, { x, y });
  }

  /** 指を (x, y) まで steps 回に分けて動かす。 */
  async move(id: number, x: number, y: number, steps = 6): Promise<void> {
    const from = this.pts.get(id);
    if (!from) throw new Error(`指 ${id} は触れていない`);
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps };
      this.pts.set(id, p);
      if (this.cdp) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points() });
      else await this.synth('pointermove', id, p);
    }
  }

  async up(id: number): Promise<void> {
    const p = this.pts.get(id);
    if (!p) return;
    this.pts.delete(id);
    // この Chromium の touchEnd は「載せた点を離す」（残る指を載せるとそちらが離れ、空なら全部離れる）。離す指だけを載せる。
    // 2026-11-03 4.3 で直した（前は残る指を載せていて、2本指の試験で先に離す指が逆になっていた。終わりには全部離れるので試験は通っていた）
    if (this.cdp) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }] });
    else await this.synth('pointerup', id, p);
    this.primary.delete(id);
  }

  /**
   * 指の取り消し（着信・端の操作など）：pointercancel を送る。本物（CDP）の touchCancel は触れている全部の指に及ぶ。
   * 代替（PointerEvent）は、その指だけの pointercancel。
   */
  async cancel(id: number): Promise<void> {
    const p = this.pts.get(id);
    if (!p) return;
    if (this.cdp) {
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      this.pts.clear();
      this.primary.clear();
      return;
    }
    await this.synth('pointercancel', id, p);
    this.pts.delete(id);
    this.primary.delete(id);
  }

  /** 代替（PointerEvent）だけ：pointerup も pointercancel も届かなかった指を、何も送らずに忘れる（取りこぼしの再現）。 */
  forget(id: number): void {
    if (this.cdp) throw new Error('本物のタッチ（CDP）では、浮いた指の記録だけを消せない。{ synthetic: true } で作る');
    this.pts.delete(id);
    this.primary.delete(id);
  }

  /** 触れてすぐ離す。 */
  async tap(id: number, x: number, y: number): Promise<void> {
    await this.down(id, x, y);
    await this.up(id);
  }

  /** 要素の真ん中を軽く押す。 */
  async tapEl(id: number, testId: string): Promise<void> {
    const c = await center(this.page, testId);
    await this.tap(id, c.x, c.y);
  }

  async downEl(id: number, testId: string): Promise<Point> {
    const c = await center(this.page, testId);
    await this.down(id, c.x, c.y);
    return c;
  }
}

export async function center(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} が画面に無い`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
