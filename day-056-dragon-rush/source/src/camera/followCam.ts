// OWNER: camera
// 遊びの三人称カメラ。視点の向き（マウス）はシミュレーションの値をそのまま使い、遅れを足さない。
// それ以外（回転の中心・距離・画角・寄せ・持ち上げ）はばねに通し、どの切り替えでも位置と速度を跳ばさない。
// 置き方の規則は狙いの光線と同じ（camera/placement.ts の solveCamera。gameplay/aim.ts の fixedCamera も同じ関数）：回転の中心を視点の右へ
// shoulder だけずらし（肩越し）、視線より lookDownDeg だけ高い所から。カメラは常に視線の向きを向くので、画面の中央が照準（狙いの光線）と重なる。
// r06-camera2：ビルの裏に置かない。視線に建物が入ったら、画面の中央の線に沿って建物の怪獣の側まで寄せ、寄せきれなければ屋上を越えるまで上げ、
// 残る分だけ網点で透かす。カメラが建物の箱の中に入るなら必ず外へ。寄せは画面の中央の線の上を動くだけ、上げる分は照準の光線も同じだけ上がる。
// 速く寄せ、空いたらゆっくり戻す。離陸の間は翼の幅が収まる距離より寄せない。
// 網点の対象（occluders）は、怪獣より手前（カメラの向きの奥行きで体の中心より手前）で視線をふさぐ建物と瓦礫の山、照準の線の竜より手前を
// ふさぐ建物だけ（r06-camera2：体験の採点 B3「網点の窓が、怪獣の向こうで燃やしている的にも開く」）。外壁のシェーダーが画面の上の範囲で間引く。
// 当たりの手応え（r05-camera）：遊びの出来事をカメラの側で受け、揺れ（向き）・画角の跳ね・着地の沈み込み（約0.3秒遅れのばね）を重ねる
// （camera/shake.ts。強さは出来事の大きさと竜からの距離、r06-camera2 から揺れの速さと減りも出来事の大きさ。崩れたビルの側へ少し傾く）。
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { CAMERA_CLEARANCE as K, CAMERA_OCCLUSION as OCC, FOLLOW_CAMERA as C, type CameraProfile } from '../config/camera';
import type { EventBus, GameEvent, GameEventType } from '../core/events';
import { damped, smoothDamp } from '../core/springs';
import type { DragonIntent } from '../dragon/intent';
import type { Feedback } from '../gameplay/game';
import { directionOf, localToWorld, vec3, type Vec3 } from '../gameplay/math';
import { raycastBeyond } from '../gameplay/aim';
import { rayMass } from '../gameplay/shapes';
import type { CityIndex } from '../world/query';
import type { CameraClearance, CollapsingStick } from './clearance';
import { emptySolve, lookUpScale, orbitDirection, rightOf, solveCamera, spanDistance, type CameraSolve } from './placement';
import { FovKick, LandingSink, ShakePool, impulseFor } from './shake';

export { spanDistance };

/** 追うカメラが読む遊びの側（gameplay の Game がこの形を満たす）。 */
export interface FollowSource {
  readonly bus: EventBus;
  readonly clock: number;
  readonly cameraProfile: CameraProfile;
  readonly cameraClearance: CameraClearance;
  /**
   * r06-camera2：照準の光線と一緒に上げる高さ（m、遊びの側が固定刻みでばねを通した値）。あればそのまま使い（画面の中央と照準の光線が
   * ばねの途中でも同じ直線）、無ければ（テストの組み立て）自分の答えを自分のばねで追う
   */
  readonly cameraRise?: { readonly value: number };
  /** r06-camera2：照準の光線と同じ肩越しのずれ（m、遊びの側がばねを通した値）。無ければ（テストの組み立て）設定の値 */
  readonly cameraShoulder?: { readonly value: number };
  /**
   * r06-camera2：遊びの側が照準の光線のために解いた置き方の答え（寄せる距離 r と何をしたか）。あればそのまま使い（同じ規則を描画ごとに
   * 解き直さない）、無ければ（テストの組み立て）自分で解く
   */
  readonly cameraSolve?: CameraSolve;
  /** 立っているか、と傾き（ラジアン）・倒れる向き（傾いた建物は、見た目は倒れかけでも当たりの形は立ったままなので、網点の対象は別に調べる） */
  readonly damage: { isStanding(id: number): boolean; tilt: ArrayLike<number>; dirX: ArrayLike<number>; dirZ: ArrayLike<number> };
}

/** 手応えに変える出来事（core/events.ts） */
const FEEL_EVENTS = new Set<GameEventType>([
  'dragon.land',
  'dragon.step',
  'dragon.claw',
  'dragon.tail',
  'building.collapse',
  'building.tilt',
  'charge.shove',
  'rage.release',
  'lava.impact',
  'fissure.crack',
  'lightning.bolt',
  'lightning.hop',
]);
/** これより古い出来事（ゲーム内の秒）は捨てる（撮影の場面作りなど、追っていない間に溜まった分） */
const STALE_SECONDS = 0.5;

/** 調べもの用（tools と E2E が window.__app.camera.userData.follow から読む）。 */
export interface FollowDebug {
  shakeDeg: number;
  /** r06-camera2：揺れの向き（度、符号つき。画面の上下・左右・ロール）と、崩れたビルの側への傾き（度） */
  shakePitch: number;
  shakeYaw: number;
  shakeRoll: number;
  leanDeg: number;
  kickDeg: number;
  sinkM: number;
  liftM: number;
  distance: number;
  pulledIn: number;
  takeoff: number;
  /** r06-camera2：置き方の規則が何をしたか（free・pull・lift・pullLift・blocked・push）と、建物を越えるために上げた高さ（m） */
  mode: string;
  liftB: number;
  /** r06-camera2：網点の窓を壁全体へ広げる度合い（0〜1） */
  spread: number;
  /** r06-camera2：このコマの update にかかった時間（ms、置き方の規則・網点の対象・広げる度合いを含む。重さの確かめ用） */
  costMs: number;
  /** 直近の手応え（出来事ごとに、規則が決めた揺れ・画角の跳ね・沈み込み・揺れの速さ・減る秒数） */
  log: { t: number; type: string; deg: number; kick: number; sink: number; dist: number; hz: number; seconds: number }[];
}

export class FollowCamera {
  private readonly px = damped();
  private readonly py = damped();
  private readonly pz = damped();
  private readonly dist = damped(C.distanceAir);
  private readonly fov = damped(C.fovBase);
  private readonly occl = damped(C.distanceAir);
  private readonly lift = damped();
  private readonly shake = new ShakePool();
  private readonly fovKick = new FovKick();
  private readonly sink = new LandingSink();
  private readonly queue: GameEvent[] = [];
  private readonly solve = emptySolve();
  private started = false;
  private wasGrounded = true;
  private takeoff = 0;
  private readonly pivot = new Vector3();
  private readonly right = new Vector3();
  private readonly tmp = new Vector3();
  private readonly fwd = vec3();
  private readonly seen = new Set<number>();
  /** カメラと竜の間にある建物（毎コマ作り直す） */
  readonly occluders = new Set<number>();
  /**
   * r06-camera2：網点の窓を壁全体へ広げる度合い（0〜1。透かし方が spread のときに使う）。カメラから spreadNear m 以内の網点の対象が
   * 画面を覆う割合（箱の8隅を画面に写した外接矩形の和）から決め、なだらかに変える
   */
  spread = 0;
  private readonly spreadSpring = damped();
  private readonly corner = new Vector3();
  private readonly sticks: CollapsingStick[] = [];
  readonly debug: FollowDebug = { shakeDeg: 0, shakePitch: 0, shakeYaw: 0, shakeRoll: 0, leanDeg: 0, kickDeg: 0, sinkM: 0, liftM: 0, distance: 0, pulledIn: 0, takeoff: 0, mode: 'free', liftB: 0, spread: 0, costMs: 0, log: [] };

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly index: CityIndex,
    private readonly source: FollowSource,
  ) {
    source.bus.onAny((e) => {
      if (!FEEL_EVENTS.has(e.type)) return;
      this.queue.push(e);
      // 追っていない間（撮影の場面作りなど）に溜まりすぎないように、古いものから捨てる
      if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    });
    camera.userData.follow = this.debug;
    // 調べもの用（r06-camera2：測る道具が怪獣ごとのカメラの値を差し替えて試す。遊びは読まない）
    camera.userData.followSource = source;
  }

  private isStanding(id: number): boolean {
    return this.source.damage.isStanding(id);
  }

  /** 次の update で、ばねを飛ばして目標の位置から始める（やり直し・撮影の後）。 */
  reset(): void {
    this.started = false;
    this.queue.length = 0;
    this.shake.reset();
    this.fovKick.reset();
    this.sink.reset();
    this.takeoff = 0;
    this.debug.log.length = 0;
  }

  /** 溜まった出来事を、揺れ・画角の跳ね・沈み込みに直す。 */
  private applyEvents(intent: DragonIntent): void {
    const [x, y, z] = intent.position;
    const body = { x, y, z };
    const now = this.source.clock;
    const running = intent.gait === 'run';
    const cam = this.camera.position;
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    for (const e of this.queue) {
      if (e.t < now - STALE_SECONDS) continue;
      const k = impulseFor(e, body, running);
      if (!k) continue;
      let dx = 0.25;
      let dy = 1;
      let side = 0;
      if (k.pos) {
        // 出来事の見える向き（カメラの右か左か）
        this.tmp.set(k.pos[0] - cam.x, k.pos[1] - cam.y, k.pos[2] - cam.z);
        const l = this.tmp.length();
        side = l > 1e-3 ? this.tmp.dot(this.right) / l : 0;
      }
      if (!k.vertical && k.pos) {
        // 出来事の見える向きへ横に寄せて揺らす
        dx = 0.85 * side;
        dy = 0.55;
      }
      this.shake.add(k.deg, k.seconds, dx, dy, k.hz, k.leanDeg * side);
      this.fovKick.kick(k.kickDeg);
      this.sink.sink(k.sinkM);
      const log = this.debug.log;
      const type = e.type === 'dragon.land' && e.slam ? 'dragon.land(slam)' : e.type;
      log.push({ t: e.t, type, deg: k.deg, kick: k.kickDeg, sink: k.sinkM, dist: k.pos ? Math.hypot(k.pos[0] - x, k.pos[2] - z) : 0, hz: k.hz, seconds: k.seconds });
      if (log.length > 96) log.splice(0, log.length - 96);
    }
    this.queue.length = 0;
  }

  /** points は竜へ光線を引く体の端の点（camera/occlusionRegion.ts。無ければ頭・胴・腰の目安の点だけ）。 */
  update(dt: number, intent: DragonIntent, view: { yaw: number; pitch: number }, feedback: Feedback[], points: readonly Vector3[] = []): void {
    const t0 = performance.now();
    // r05-camera：手応えは出来事から作る（遊びの側の feedback は読まずに捨てる）
    feedback.length = 0;
    this.applyEvents(intent);
    const p = this.source.cameraProfile;
    const [x, y, z] = intent.position;
    const [vx, vy, vz] = intent.velocity;
    const tx = x + vx * C.lookAhead;
    const ty = y + p.pivotHeight + vy * C.lookAhead * 0.2;
    const tz = z + vz * C.lookAhead;
    const diving = intent.mode === 'dive';
    const flying = intent.mode === 'air' || diving;
    if (!intent.grounded && this.wasGrounded && this.started) this.takeoff = K.takeoffSeconds;
    this.wasGrounded = intent.grounded;
    this.takeoff = Math.max(0, this.takeoff - dt);
    const distTarget = diving ? p.distanceDive : intent.grounded ? p.distanceGround : p.distanceAir;
    const fovTarget = diving ? p.fovDive : intent.gait === 'run' ? p.fovRun : p.fovBase;
    const first = !this.started;
    if (first) {
      this.started = true;
      this.px.value = tx;
      this.py.value = ty;
      this.pz.value = tz;
      this.px.velocity = this.py.velocity = this.pz.velocity = 0;
      this.dist.value = distTarget;
      this.fov.value = fovTarget;
      this.occl.value = distTarget;
      this.lift.value = 0;
      this.lift.velocity = 0;
    }
    smoothDamp(this.px, tx, C.pivotSmooth, dt);
    smoothDamp(this.py, ty, C.pivotSmoothVertical, dt);
    smoothDamp(this.pz, tz, C.pivotSmooth, dt);
    smoothDamp(this.dist, distTarget, C.distanceSmooth, dt);
    smoothDamp(this.fov, fovTarget, C.fovSmooth, dt);
    // 肩越しのずれは、ばねを通した後に視点の向きから直接足す（視点を振ったとき、画面の中央と照準がずれないように）
    const right = rightOf(view.yaw);
    const sharedShoulder = this.source.cameraShoulder;
    const shoulder = sharedShoulder && sharedShoulder.value >= 0 ? sharedShoulder.value : p.shoulder;
    this.pivot.set(this.px.value + right.x * shoulder, this.py.value, this.pz.value + right.z * shoulder);

    const d = directionOf(view.yaw, view.pitch);
    const o = orbitDirection(p, view);
    const want = this.dist.value * lookUpScale(view.pitch);
    // 照準の線の要（軌道のカメラから視線の向きへ want だけ進んだ点。見下ろしの足しが 0 なら回転の中心）
    const anchor = vec3(this.pivot.x - o.x * want + d.x * want, this.pivot.y - o.y * want + d.y * want, this.pivot.z - o.z * want + d.z * want);
    // r06-camera2：置き方の規則（照準の光線と同じ関数）。寄せる距離 r と、線ごと上げる高さ rise
    const s = this.source.cameraSolve ?? solveCamera(p, { x: this.pivot.x, y: this.pivot.y, z: this.pivot.z }, { x, y, z }, intent.groundY, want, view, this.source.cameraClearance, flying, this.solve);
    // 離陸の間は、翼の幅が画面に収まる距離より寄せない（r01 の指摘：離陸の直後は28m まで寄って翼が画面の半分をふさいだ）
    let allowed = s.r;
    if (this.takeoff > 0) allowed = Math.max(allowed, Math.min(want, spanDistance(p.wingSpan, this.camera.fov, this.camera.aspect)));
    if (first) this.occl.value = allowed;
    smoothDamp(this.occl, allowed, allowed < this.occl.value ? C.groundIn : C.groundOut, dt);
    const r = Math.min(want, this.occl.value);
    const shared = this.source.cameraRise;
    if (shared) {
      this.lift.value = shared.value;
      this.lift.velocity = 0;
    } else if (first) this.lift.value = s.rise;
    else smoothDamp(this.lift, s.rise, s.rise > this.lift.value ? K.liftRise : K.liftFall, dt);
    const cam = this.camera;
    cam.position.set(anchor.x - d.x * r, anchor.y - d.y * r + Math.max(0, this.lift.value), anchor.z - d.z * r);
    // 地面から minHeight より下へは、ばねの遅れでも下げない
    cam.position.y = Math.max(cam.position.y, intent.groundY + C.minHeight);
    this.fwd.x = d.x;
    this.fwd.y = d.y;
    this.fwd.z = d.z;
    this.collectOccluders(intent, cam.position, points, vec3(anchor.x - d.x * 4, anchor.y - d.y * 4 + Math.max(0, this.lift.value), anchor.z - d.z * 4));
    const sink = this.sink.update(dt);
    cam.position.y += sink;
    cam.up.set(0, 1, 0);
    // 視線の向きを向く（高さを止めたとき・上げたときも照準と画面の中央が重なる）
    cam.lookAt(cam.position.x + d.x * 100, cam.position.y + d.y * 100, cam.position.z + d.z * 100);
    // 揺れ：向きで与える（位置は動かさない）
    const sh = this.shake.update(dt);
    if (sh.deg > 1e-4 || Math.abs(sh.roll) > 1e-4 || Math.abs(sh.yaw) > 1e-4) {
      cam.rotateY(MathUtils.degToRad(sh.yaw));
      cam.rotateX(MathUtils.degToRad(sh.pitch));
      cam.rotateZ(MathUtils.degToRad(sh.roll));
    }
    const kick = this.fovKick.update(dt);
    const fov = this.fov.value + kick;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    this.measureSpread(dt);
    const dbg = this.debug;
    dbg.shakeDeg = sh.deg;
    dbg.shakePitch = sh.pitch;
    dbg.shakeYaw = sh.yaw;
    dbg.shakeRoll = sh.roll;
    dbg.leanDeg = sh.lean;
    dbg.kickDeg = kick;
    dbg.sinkM = sink;
    dbg.liftM = Math.max(0, this.lift.value);
    dbg.distance = r;
    dbg.pulledIn = want - r;
    dbg.takeoff = this.takeoff;
    dbg.mode = s.mode;
    dbg.liftB = s.liftB;
    dbg.spread = this.spread;
    dbg.costMs = performance.now() - t0;
  }

  /**
   * カメラから竜の点（頭・胴・腰・回転の中心と体の端の骨）へ光線を引き、途中で通る建物とカメラを包む建物を集める。
   * r05-camera：途中の瓦礫の山（崩れた建物の番号）も集める。外壁と同じく、壊れ方の表の透かす度合いを瓦礫の山のシェーダーが引く。
   * r06-camera2：怪獣より奥の建物は集めない。光線が建物に入る点の奥行き（カメラの向き）が体の中心の奥行き＋depthSlack より手前のものだけ。
   * 照準の線（center：要の 4m 手前まで）をふさぐ建物は、奥行きによらず集める（照準はそこを飛ばして奥を狙うので、画面でも透けていないと食い違う）
   */
  private collectOccluders(intent: DragonIntent, cam: Vector3, points: readonly Vector3[], center: Vec3): void {
    this.occluders.clear();
    const [x, y, z] = intent.position;
    const body = { x, y, z };
    const targets: Vec3[] = [localToWorld(body, intent.yaw, 0, 6, 20), body, localToWorld(body, intent.yaw, 0, 2, -14), { x: this.pivot.x, y: this.pivot.y, z: this.pivot.z }];
    for (const p of points) targets.push({ x: p.x, y: p.y, z: p.z });
    const o = vec3(cam.x, cam.y, cam.z);
    const f = this.fwd;
    const depthBody = (x - o.x) * f.x + (y - o.y) * f.y + (z - o.z) * f.z + OCC.depthSlack;
    const heaps = this.source.cameraClearance;
    const dir = vec3();
    for (const t of targets) {
      const len = this.toward(o, t, dir);
      if (len < 1) continue;
      this.castOccluders(o, dir, Math.max(0, len - 4), depthBody);
      // r05-camera：カメラと竜の間（竜の体の中まで）の瓦礫の山も、建物と同じく網点で透かす（体験の採点の B2：山に埋まって見えない）。
      // r06-camera2：体の中心より奥で光線が山に入るものは除く
      const along = dir.x * f.x + dir.y * f.y + dir.z * f.z;
      heaps.heapsBlocking(o, t, this.occluders, 0, along > 1e-3 ? depthBody / (along * len) : 1);
    }
    // 照準の線の竜より手前（奥行きによらず）
    const lc = this.toward(o, center, dir);
    if (lc >= 1) {
      this.castOccluders(o, dir, lc, Infinity);
      // 照準が狙う建物（竜より手前を飛ばした最初の建物。gameplay/aim.ts の castAim と同じ）は、ほかの光線で入っても透かさない
      // （狙っている的に窓を開けない。B3。画面の中央に写る建物と照準の建物を一致させる。B2）
      const aimed = raycastBeyond(this.index, o, dir, lc, 700, (b) => this.isStanding(b.id));
      if (aimed) this.occluders.delete(aimed.building.id);
    }
    this.addTilted(o, body, targets, depthBody);
    this.addCollapsing(o, targets, depthBody);
    for (const b of this.index.buildingsNear(cam.x, cam.z, 1)) if (cam.y < b.height + 2 && this.isStanding(b.id)) this.occluders.add(b.id);
  }

  /** r06-camera2：カメラのすぐ前の網点の対象が画面を覆う割合から、窓を壁全体へ広げる度合いを決める（spread の透かし方）。 */
  private measureSpread(dt: number): void {
    const cam = this.camera;
    const buildings = this.index.city.buildings;
    let cover = 0;
    for (const id of this.occluders) {
      const b = buildings[id];
      const f = b.footprint;
      const y0 = b.masses[0].y0;
      // 崩れた建物は、元の高さでなく瓦礫の山のいまの高さで数える（元の箱で数えると、低い山でも画面を覆う面と見なした）
      const top = this.isStanding(id) ? b.height : y0 + this.source.cameraClearance.heapHeight(id);
      if (top <= y0 + 0.5) continue;
      const nx = Math.max(f.x0 - cam.position.x, 0, cam.position.x - f.x1);
      const ny = Math.max(y0 - cam.position.y, 0, cam.position.y - top);
      const nz = Math.max(f.z0 - cam.position.z, 0, cam.position.z - f.z1);
      if (Math.hypot(nx, ny, nz) > OCC.spreadNear) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0s = Infinity;
      let y1s = -Infinity;
      let behind = false;
      for (let k = 0; k < 8; k++) {
        this.corner.set(k & 1 ? f.x1 : f.x0, k & 2 ? top : y0, k & 4 ? f.z1 : f.z0).project(cam);
        if (this.corner.z > 1) {
          behind = true;
          continue;
        }
        x0 = Math.min(x0, this.corner.x);
        x1 = Math.max(x1, this.corner.x);
        y0s = Math.min(y0s, this.corner.y);
        y1s = Math.max(y1s, this.corner.y);
      }
      // カメラの面をまたぐ箱（すぐ横の壁）は、写った隅の外接矩形を画面の端まで広げて数える
      if (behind) {
        if (x1 < x0) continue;
        x0 = Math.min(x0, -1);
        x1 = Math.max(x1, 1);
      }
      const w = Math.max(0, Math.min(1, x1) - Math.max(-1, x0));
      const h = Math.max(0, Math.min(1, y1s) - Math.max(-1, y0s));
      cover += (w * h) / 4;
    }
    const k = Math.min(1, Math.max(0, (cover - OCC.spreadOn) / (OCC.spreadFull - OCC.spreadOn)));
    const target = k * k * (3 - 2 * k);
    smoothDamp(this.spreadSpring, target, target > this.spreadSpring.value ? 0.25 : 0.6, dt);
    this.spread = Math.min(1, Math.max(0, this.spreadSpring.value));
  }

  /** o から t への単位ベクトルを out に入れ、長さを返す。 */
  private toward(o: Vec3, t: Vec3, out: Vec3): number {
    const dx = t.x - o.x;
    const dy = t.y - o.y;
    const dz = t.z - o.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return 0;
    out.x = dx / len;
    out.y = dy / len;
    out.z = dz / len;
    return len;
  }

  /** 光線 o → dir（maxT まで）が通る立っている建物のうち、入る点の奥行き（カメラの向き）が depthLimit より手前のものを集める。 */
  private castOccluders(o: Vec3, dir: Vec3, maxT: number, depthLimit: number): void {
    const seen = this.seen;
    seen.clear();
    const step = 30;
    const f = this.fwd;
    const along = dir.x * f.x + dir.y * f.y + dir.z * f.z;
    for (let s = 0; s <= maxT + step; s += step) {
      const t = Math.min(s, maxT);
      for (const b of this.index.buildingsNear(o.x + dir.x * t, o.z + dir.z * t, step)) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        if (this.occluders.has(b.id) || !this.isStanding(b.id)) continue;
        let entry = Infinity;
        for (const m of b.masses) {
          const h = rayMass(m, o, dir, maxT);
          if (h >= 0 && h < entry) entry = h;
        }
        if (entry < Infinity && entry * along < depthLimit) this.occluders.add(b.id);
      }
    }
  }

  /**
   * r06-camera2：崩れている途中の建物（遊びの上ではもう立っていないが、上の塊がまだ高く残る）も、視線をふさぐなら網点の対象に入れる。
   * 見た目の棒（camera/clearance.ts の collapsing：根元の中心から上の塊の先まで）と視線の近さで決める。奥行きの決まりは傾いた建物と同じ
   */
  private addCollapsing(o: Vec3, targets: readonly Vec3[], depthLimit: number): void {
    const n = this.source.cameraClearance.collapsing(this.sticks);
    const f = this.fwd;
    const depth = (q: Vec3): number => (q.x - o.x) * f.x + (q.y - o.y) * f.y + (q.z - o.z) * f.z;
    for (let i = 0; i < n; i++) {
      const s = this.sticks[i];
      if (this.occluders.has(s.id) || Math.min(depth(s.foot), depth(s.top)) > depthLimit) continue;
      for (const t of targets) {
        if (segmentDistance(o, t, s.foot, s.top) < s.r) {
          this.occluders.add(s.id);
          break;
        }
      }
    }
  }

  /**
   * r05-camera：傾いた建物も、視線をふさぐなら網点の対象に入れる。光線の当たりは立ったままの形で見るので、倒れかけて視線へ
   * 覆いかぶさった高層は漏れていた（雷翼の通しで、画面の大半をふさいだまま透けなかった標本が1枚）。
   * 根元の中心から、傾いた屋上の中心までの線分を、外形の幅の半分ほどの太さの棒とみなして、視線との近さで決める。
   * r06-camera2：棒の手前の端（根元と屋上の近い方）の奥行きが depthLimit より奥なら入れない（怪獣の向こうへ倒れる建物）
   */
  private addTilted(o: Vec3, body: Vec3, targets: readonly Vec3[], depthLimit = Infinity): void {
    const d = this.source.damage;
    const f = this.fwd;
    const R = Math.hypot(o.x - body.x, o.z - body.z) / 2 + 40;
    for (const b of this.index.buildingsNear((o.x + body.x) / 2, (o.z + body.z) / 2, R)) {
      const a = d.tilt[b.id];
      if (!(a > 0.02) || this.occluders.has(b.id) || !this.isStanding(b.id)) continue;
      const fp = b.footprint;
      const y0 = b.masses[0].y0;
      const h = b.height - y0;
      const foot = vec3((fp.x0 + fp.x1) / 2, y0, (fp.z0 + fp.z1) / 2);
      const top = vec3(foot.x + d.dirX[b.id] * h * Math.sin(a), y0 + h * Math.cos(a), foot.z + d.dirZ[b.id] * h * Math.sin(a));
      const depth = (q: Vec3): number => (q.x - o.x) * f.x + (q.y - o.y) * f.y + (q.z - o.z) * f.z;
      if (Math.min(depth(foot), depth(top)) > depthLimit) continue;
      const r = 0.25 * (fp.x1 - fp.x0 + (fp.z1 - fp.z0));
      for (const t of targets) {
        if (segmentDistance(o, t, foot, top) < r) {
          this.occluders.add(b.id);
          break;
        }
      }
    }
  }
}

/** 2本の線分 p0-p1 と q0-q1 のいちばん近い点どうしの距離（m）。 */
export function segmentDistance(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const vx = q1.x - q0.x, vy = q1.y - q0.y, vz = q1.z - q0.z;
  const wx = p0.x - q0.x, wy = p0.y - q0.y, wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const dd = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * e - c * dd) / den)) : 0;
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? Math.min(1, Math.max(0, -dd / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? Math.min(1, Math.max(0, (b - dd) / a)) : 0;
  }
  const dx = wx + ux * s - vx * t;
  const dy = wy + uy * s - vy * t;
  const dz = wz + uz * s - vz * t;
  return Math.hypot(dx, dy, dz);
}
