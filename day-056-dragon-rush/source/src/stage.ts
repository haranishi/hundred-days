// OWNER: core
// 遊びの舞台：遊びの本体（gameplay の Game）と、それを描く側（竜の表示・追うカメラ・効果・壊れ方の表）を1つにまとめる。
// 遊び（play.ts）と撮影（harness/shotScenes.ts）が同じ組み立てを使うので、撮った絵と遊んだ絵が同じ仕組みから出る。
// r03-roster：怪獣は3体。遊ぶ怪獣は app.dragon（表示）と game.creature（規則）の両方で持ち、setCreature で同時に替える。
// 雷翼と焔角の技の見た目は creatureFx（src/fx/creatureFx.ts）が描く。炎の見た目（breathView）は炎を吐く怪獣（紅竜）だけ。
import { Vector3 } from 'three';
import type { App } from './app';
import { FollowCamera } from './camera/followCam';
import { OcclusionRegion } from './camera/occlusionRegion';
import type { CreatureId } from './config/creatures';
import { CreatureFx } from './fx/creatureFx';
import { FxDirector, type BreathView } from './fx/fxDirector';
import { Game } from './gameplay/game';

export class Stage {
  readonly game: Game;
  readonly fx: FxDirector;
  readonly creatureFx: CreatureFx;
  readonly follow: FollowCamera;
  /** r05-camera：網点で透かす範囲（画面の上で体と照準のまわり） */
  readonly occlusionRegion = new OcclusionRegion();
  private lastClock = 0;
  private lastFov = 0;
  private readonly noOccluders = new Set<number>();
  private readonly breath: BreathView = { mouth: new Vector3(), target: new Vector3(), hit: false };

  constructor(readonly app: App) {
    this.game = new Game(app.city, app.index, undefined, app.dragon.creature.id);
    this.fx = new FxDirector(this.game, app.kit, app.atmosphere, app.settings.quality, app.scene);
    app.scene.add(this.fx.group);
    app.mirrorHidden.push(...this.fx.mirrorHidden);
    this.creatureFx = new CreatureFx(this.game, app.atmosphere, app.settings.quality, (out) => this.app.dragon.mouthWorld(out));
    app.scene.add(this.creatureFx.group);
    app.mirrorHidden.push(...this.creatureFx.mirrorHidden);
    this.follow = new FollowCamera(app.camera, app.index, this.game);
  }

  /**
   * 1コマ：竜の姿勢・カメラ・効果・壊れ方の表を、遊びの状態に合わせる。
   * frozen（一時停止・撮影モード）のときは竜の姿勢も止める。効果はゲーム内時刻の進みだけ動く。
   */
  frame(frameDt: number, opts: { follow: boolean; frozen: boolean }): void {
    const g = this.game;
    const simDt = Math.max(0, g.clock - this.lastClock);
    this.lastClock = g.clock;
    // r00c-竜：竜の動きは遊びの時刻で進める（ヒットストップで遅くなり、自動プレイの早回しでも切り替えの速さが遊びと合う）。旧：frameDt
    this.app.dragon.applyIntent(g.intent, opts.frozen ? 0 : simDt);
    const region = this.occlusionRegion;
    if (opts.follow) {
      // r05-camera：体の骨（前のコマの姿勢）を集め、竜へ引く光線の点と網点の範囲に使う
      region.gather(this.app.dragon.root, g.intent.yaw, g.creature.body.radius);
      this.follow.update(frameDt, g.intent, g.view, g.feedback, region.rayPoints);
      if (this.app.camera.fov !== this.lastFov) {
        this.lastFov = this.app.camera.fov;
        this.app.cameraChanged();
      }
      region.project(this.app.camera);
    }
    this.app.cityView.damage.setOccluders(opts.follow ? this.follow.occluders : this.noOccluders, frameDt);
    // r06-camera2：透かし方（窓・壁全体へ広げる・怪獣の形）と、広げる度合い・怪獣の形を渡す
    this.app.cityView.damage.setOcclusionRegion(this.app.camera, opts.follow ? region.box : null, { style: region.style, spread: this.follow.spread, silhouette: region.silhouette });
    this.fx.update(simDt, this.app.camera, this.app.size.height, this.breathView());
    this.creatureFx.update(simDt, this.app.camera, this.app.size.height);
    this.app.cityView.damage.sync(g.damage, g.fire, g.clock);
  }

  /** 吐いている炎の見た目：口は竜の表示から、当たる点は遊びの側から取る。雷の息と溶岩の礫は creatureFx が描くので null。 */
  breathView(): BreathView | null {
    const b = this.game.intent.breath;
    if (this.game.creature.moves.primary.kind !== 'flame') return null;
    if (!b.active || !b.target) return null;
    this.app.dragon.mouthWorld(this.breath.mouth);
    this.breath.target.set(b.target[0], b.target[1], b.target[2]);
    this.breath.hit = this.game.combat.breathHasTarget;
    return this.breath;
  }

  /** 追加した材質（粒子・破片・瓦礫・炎の光）を先にまとめてコンパイルし、遊んでいる最中の引っかかりを防ぐ。 */
  async warmUp(): Promise<void> {
    this.fx.prime(true);
    this.creatureFx.prime(true);
    await this.app.renderer.compileAsync(this.app.scene, this.app.camera);
    // 影と鏡像の材質は描いて初めて作られるので、1コマ描いておく
    this.app.renderFrame(0);
    this.fx.prime(false);
    this.creatureFx.prime(false);
  }

  /** やり直し：遊び・効果・カメラを最初に戻す。 */
  restart(): void {
    this.game.restart();
    this.fx.clear();
    this.creatureFx.clear();
    this.follow.reset();
    this.lastClock = 0;
    this.app.cityView.damage.sync(this.game.damage, this.game.fire, 0);
  }

  /**
   * 遊ぶ怪獣を替える（始める前・結果の画面から）。表示を差し替えてから規則の側を替え、カメラを新しい始まりへ飛ばす。
   * 結果の画面からは、この後に restart を呼ぶ（街も点数も最初に戻す）。
   */
  async setCreature(id: CreatureId, onStage?: (phase: 'model' | 'render') => void | Promise<void>): Promise<void> {
    await this.app.setCreature(id, onStage);
    this.game.setCreature(id);
    this.creatureFx.clear();
    this.follow.reset();
  }
}
