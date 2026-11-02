// OWNER: chars-art
// 確認ページの場面。人物ごとに「時刻 → CharacterSnap」を返す運転手（drive）を持たせ、ゲームの sim の代わりに姿勢の契約を流す。
import { Color, MeshBasicMaterial, type MeshStandardMaterial, NoToneMapping, type PerspectiveCamera, Vector3 } from 'three';
import { shotCameraPosition, type ShotDef } from '../../../contract/shots';
import type { ActionKind, CharacterKind, CharacterPose, CharacterSnap, Stance } from '../../../contract/snapshot';
import { createCharacter, type CharacterInternals } from '../character';
import type { LabStage } from './stage';

export interface Actor {
  char: CharacterInternals;
  /** 姿勢の一覧のマスの番号（寄って撮るとき、そのマスの人物だけを出す）。 */
  cell?: number;
  drive(t: number, dt: number): CharacterSnap;
  label?: string;
  labelY?: number;
  labelAt?: Vector3;
}

export interface Scenario {
  actors: Actor[];
  /** 撮る前に進めるコマ数（1/60 秒）。 */
  warmup: number;
  camera(cam: PerspectiveCamera, t: number): void;
  lookAt?: Vector3;
  shadow?: { target: Vector3; half: number };
  after?(t: number, dt: number): void;
}

const DEG = Math.PI / 180;

export function weaponOf(kind: CharacterKind): CharacterPose['weapon'] {
  return kind === 'ashigaru' ? 'spear' : kind === 'nobunaga' ? 'none' : 'katana';
}

export function pose(kind: CharacterKind, o: Partial<CharacterPose> = {}): CharacterPose {
  return { speed: 0, stance: 'stand', awareness: 'calm', headYaw: 0, action: null, lantern: false, weapon: weaponOf(kind), ...o };
}

/** 立ち止まった人物（向きは度。90 が +Z＝カメラの方）。 */
export function still(kind: CharacterKind, id: string, x: number, z: number, yawDeg: number, o: Partial<CharacterPose> = {}, label?: string): Actor {
  const char = createCharacter(kind);
  const p = pose(kind, o);
  return { char, label, drive: () => ({ id, kind, x, z, yaw: yawDeg * DEG, pose: p }) };
}

/** 直線を行ったり来たりせず、一方向へ歩き続け、長さ len を過ぎたら始めに戻る（戻る時は瞬間移動になる）。 */
export function walker(kind: CharacterKind, id: string, x0: number, z0: number, yawDeg: number, speed: number, len: number, o: Partial<CharacterPose> = {}, label?: string, phase = 0): Actor {
  const char = createCharacter(kind);
  const yaw = yawDeg * DEG;
  const dx = Math.cos(yaw);
  const dz = Math.sin(yaw);
  const p = pose(kind, { ...o, speed });
  return {
    char,
    label,
    drive: (t) => {
      const s = (phase + t * speed) % len;
      return { id, kind, x: x0 + dx * s, z: z0 + dz * s, yaw, pose: p };
    },
  };
}

/** 円を歩く（曲がりながらの足運びを見る）。 */
export function circler(kind: CharacterKind, id: string, cx: number, cz: number, r: number, speed: number, o: Partial<CharacterPose> = {}, label?: string, a0 = 0): Actor {
  const char = createCharacter(kind);
  const p = pose(kind, { ...o, speed });
  return {
    char,
    label,
    drive: (t) => {
      const a = a0 + (t * speed) / r;
      return { id, kind, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, yaw: a + Math.PI / 2, pose: p };
    },
  };
}

/** 決まった刻みで動作を進める（t0 秒に始まり dur 秒で 1）。終わった後は stanceAfter。 */
export function actor(kind: CharacterKind, id: string, x: number, z: number, yawDeg: number, kindOf: ActionKind, t0: number, dur: number, o: Partial<CharacterPose> = {}, stanceAfter?: Stance, label?: string, freezeAt?: number): Actor {
  const char = createCharacter(kind);
  const base = pose(kind, o);
  return {
    char,
    label,
    drive: (t) => {
      let at = (t - t0) / dur;
      if (freezeAt !== undefined) at = Math.min(at, freezeAt);
      const p: CharacterPose = { ...base };
      if (at >= 0 && at <= 1) p.action = { kind: kindOf, t: at };
      else if (at > 1 && stanceAfter) p.stance = stanceAfter;
      return { id, kind, x, z, yaw: yawDeg * DEG, pose: p };
    },
  };
}

function lookFrom(cam: PerspectiveCamera, pos: Vector3, target: Vector3, fov: number): void {
  cam.fov = fov;
  cam.position.copy(pos);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
}

function shotCam(cam: PerspectiveCamera, s: ShotDef): void {
  const [x, y, z] = shotCameraPosition(s);
  lookFrom(cam, new Vector3(x, y, z), new Vector3(...s.target), s.fov);
}

type Factory = (stage: LabStage, q: URLSearchParams) => Scenario;

const KINDS: CharacterKind[] = ['player', 'ashigaru', 'samurai', 'ranmaru', 'nobunaga'];
const NAMES: Record<CharacterKind, string> = { player: '光秀（忍び）', ashigaru: '足軽', samurai: '中門の番兵（侍）', ranmaru: '森蘭丸', nobunaga: '織田信長' };

export const SCENARIOS: Record<string, Factory> = {
  /** 5種を横一列。やや見上げの斜め前から。 */
  lineup: (stage) => {
    const actors = KINDS.map((k, i) => {
      const x = -3.2 + i * 1.6;
      const a = still(k, `lineup-${k}`, x, 0, 90, k === 'nobunaga' ? { stance: 'sit' } : k === 'ashigaru' ? { lantern: false } : {}, NAMES[k]);
      a.labelY = 2.15;
      return a;
    });
    stage.warm[0].position.set(-2.4, 1.6, 2.2);
    stage.warm[1].position.set(2.8, 1.3, 1.6);
    return {
      actors,
      warmup: 40,
      camera: (cam) => lookFrom(cam, new Vector3(2.4, 0.75, 6.4), new Vector3(0, 0.95, 0), 38),
      lookAt: new Vector3(0, 0.95, 0),
      shadow: { target: new Vector3(0, 0, 0), half: 5 },
    };
  },

  /** 背中側から（紋や垂れ・羽織を見る）。 */
  lineupBack: (stage) => {
    const actors = KINDS.map((k, i) => {
      const x = -3.2 + i * 1.6;
      const a = still(k, `back-${k}`, x, 0, -90, k === 'nobunaga' ? { stance: 'sit' } : {}, NAMES[k]);
      a.labelY = 2.15;
      return a;
    });
    stage.warm[0].position.set(-2.4, 1.6, 2.2);
    stage.warm[1].position.set(2.8, 1.3, 1.6);
    return {
      actors,
      warmup: 40,
      camera: (cam) => lookFrom(cam, new Vector3(-2.0, 1.6, 6.2), new Vector3(0, 0.95, 0), 38),
      shadow: { target: new Vector3(0, 0, 0), half: 5 },
    };
  },

  /**
   * 姿勢の一覧（4×3）：歩き・走り・しゃがみ歩き・不審・発見・提灯・居眠り・座り・倒れ・当て身の組 t=0.5・討ち取りの組 t=0.5・投げ。
   * 歩く人は撮る瞬間にマスの中央へ来るよう、遠くから歩いてくる（途中で瞬間移動させない）。
   */
  poses: (stage, q) => {
    const T = 2.4; // 撮る時刻（秒）
    const focus = q.get('cell') === null ? -1 : Number(q.get('cell'));
    const warmup = Math.round(T * 60);
    const cols = [-3.9, -1.3, 1.3, 3.9];
    const rows = [-2.6, 0.2, 3.0];
    const cell = (c: number, r: number) => ({ x: cols[c], z: rows[r] });
    /** 撮る時刻にマスの中央を通るよう、向き yawDeg・速さ v で歩く人。 */
    const through = (kind: CharacterKind, id: string, c: number, r: number, yawDeg: number, v: number, o: Partial<CharacterPose>, label: string) => {
      const m = cell(c, r);
      const yaw = yawDeg * DEG;
      const L = v * T;
      return walker(kind, id, m.x - Math.cos(yaw) * L, m.z - Math.sin(yaw) * L, yawDeg, v, 1e9, o, label);
    };
    const all: Actor[] = [
      through('ashigaru', 'p-walk', 0, 0, 30, 1.25, {}, '歩き'),
      through('ashigaru', 'p-run', 1, 0, 30, 4.3, { awareness: 'alert' }, '走り（発見）'),
      through('player', 'p-crouch', 2, 0, 30, 1.5, { stance: 'crouch' }, 'しゃがみ歩き'),
      still('ashigaru', 'p-susp', cols[3], rows[0], 70, { awareness: 'suspicious', headYaw: 0.3 }, '不審'),
      still('samurai', 'p-alert', cols[0], rows[1], 60, { awareness: 'alert' }, '発見（侍）'),
      through('ashigaru', 'p-lantern', 1, 1, 30, 1.2, { lantern: true }, '提灯'),
      still('ashigaru', 'p-doze', cols[2], rows[1], 80, { stance: 'doze' }, '居眠り'),
      still('nobunaga', 'p-sit', cols[3], rows[1], 70, { stance: 'sit' }, '座り'),
      still('ashigaru', 'p-down', cols[0], rows[2], 90, { stance: 'down' }, '倒れ'),
      actor('ashigaru', 'p-tdv', cols[1] + 0.35, rows[2], 0, 'takedownVictim', T - 0.6, 1.0, {}, 'down', '当て身 t=0.5', 0.5),
      actor('player', 'p-td', cols[1] - 0.35, rows[2], 0, 'takedown', T - 0.6, 1.0, { stance: 'crouch' }, 'crouch', undefined, 0.5),
      actor('nobunaga', 'p-asv', cols[2] + 0.2, rows[2], 0, 'assassinateVictim', T - 1.0, 1.6, { stance: 'sit' }, 'sit', '討ち取り t=0.5', 0.5),
      actor('player', 'p-as', cols[2] - 0.62, rows[2], 0, 'assassinate', T - 1.0, 1.6, { stance: 'crouch' }, 'crouch', undefined, 0.5),
      actor('player', 'p-throw', cols[3], rows[2], 60, 'throw', T - 0.6, 0.6, {}, 'stand', '投げ t=0.5', 0.5),
    ];
    const cellOf = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 10, 11];
    all.forEach((a, i) => (a.cell = cellOf[i]));
    const actors = focus >= 0 ? all.filter((a) => a.cell === focus) : all;
    if (focus >= 0) for (const a of all) if (a.cell !== focus) a.char.dispose();
    stage.warm[0].position.set(-2.6, 1.8, 1.6);
    stage.warm[1].position.set(2.8, 1.5, -1.0);
    // cell=N（0〜11）：そのマスだけに寄って撮る（講評で細部を見るため）
    if (focus >= 0) {
      const m = cell(focus % 4, Math.floor(focus / 4));
      const tgt = new Vector3(m.x, 0.75, m.z);
      // view=side は真横（+X 側）から、view=top は遊ぶ角度に近い上から
      const view = q.get('view');
      const from = view === 'side' ? new Vector3(m.x + 3.3, 1.2, m.z + 0.15) : view === 'top' ? new Vector3(m.x, 4.6, m.z + 4.1) : new Vector3(m.x + 1.3, 1.55, m.z + 3.1);
      return {
        actors,
        warmup,
        camera: (cam) => lookFrom(cam, from, tgt, 36),
        shadow: { target: new Vector3(m.x, 0, m.z), half: 3 },
      };
    }
    return {
      actors,
      warmup,
      camera: (cam) => lookFrom(cam, new Vector3(0.4, 5.6, 10.2), new Vector3(0, 0.5, 0.3), 40),
      lookAt: new Vector3(0, 0.5, 0.3),
      shadow: { target: new Vector3(0, 0, 0.3), half: 8 },
    };
  },

  /** 影絵：遊ぶ角度の構図で、人物を真っ黒・地面を明るい無地にする（輪郭だけで誰か分かるかの試験）。 */
  gameplayMatte: (stage, q) => {
    q.set('matte', '1');
    const sc = SCENARIOS.gameplay(stage, q);
    for (const a of sc.actors) {
      a.char.mesh.material = new MeshBasicMaterial({ color: 0x050505 });
      a.char.shadow.mesh.visible = false;
    }
    const g = stage.ground.material as MeshStandardMaterial;
    g.map = null;
    g.color.setHex(0xffffff);
    g.emissive.setHex(0xd8dde6);
    g.needsUpdate = true;
    stage.scene.background = new Color(0xd8dde6);
    stage.scene.fog = null;
    stage.renderer.toneMapping = NoToneMapping;
    return sc;
  },

  /** 遊ぶ角度（見下ろし 48°・11m）で、白砂の上に番兵3人とプレイヤー。輪郭が読めるかの試験。 */
  gameplay: (stage, q) => {
    const matte = q.get('matte') === '1';
    const actors: Actor[] = [
      walker('ashigaru', 'g-lantern', -3.2, 1.2, 0, 1.2, 40, { lantern: true }, '足軽（提灯）', 1.5),
      still('samurai', 'g-samurai', 2.2, -1.6, 120, { headYaw: -0.3 }, '侍'),
      still('ashigaru', 'g-ashi', 3.4, 1.6, 200, {}, '足軽'),
      walker('player', 'g-player', 0.2, 3.6, -70, 1.5, 40, { stance: 'crouch' }, '光秀', 0.4),
      still('ranmaru', 'g-ran', -0.6, -2.6, 60, {}, '蘭丸'),
      still('nobunaga', 'g-nobu', 0.9, -3.8, 180, { stance: 'sit' }, '信長'),
    ];
    if (matte) for (const a of actors) a.label = undefined;
    stage.warm[0].position.set(-3.0, 1.7, -0.6);
    stage.warm[1].position.set(2.6, 1.3, 2.4);
    const s: ShotDef = { name: 'lab-gameplay', target: [0, 0.9, 0], yawDeg: 270, pitchDeg: 48, distance: 11, fov: 50, t: 0, note: '' };
    return {
      actors,
      warmup: 90,
      camera: (cam) => shotCam(cam, s),
      shadow: { target: new Vector3(0, 0, 0), half: 8 },
    };
  },

  ...Object.fromEntries(
    KINDS.map((k) => [
      `close${k[0].toUpperCase()}${k.slice(1)}`,
      ((stage: LabStage, q: URLSearchParams) => {
        // 前・横・後ろの3体を並べて近くから見る（形の確認）
        const o: Partial<CharacterPose> = k === 'nobunaga' ? { stance: 'sit' } : k === 'ashigaru' ? { lantern: true } : {};
        if (q.get('stance')) o.stance = q.get('stance') as Stance;
        const actors: Actor[] = [still(k, `c-${k}-f`, -0.95, 0, 90, o), still(k, `c-${k}-s`, 0, 0, 0, o), still(k, `c-${k}-b`, 0.95, 0, -90, o)];
        stage.warm[0].position.set(-1.6, 1.8, 1.8);
        stage.warm[1].position.set(1.8, 1.2, 1.4);
        return {
          actors,
          warmup: 40,
          camera: (cam: PerspectiveCamera) => lookFrom(cam, new Vector3(0.2, 1.25, 4.1), new Vector3(0, 0.95, 0), 36),
          shadow: { target: new Vector3(0, 0, 0), half: 3 },
        };
      }) as Factory,
    ]),
  ),

  /** 自由に見る：全員が歩き回る。 */
  roam: () => {
    const actors: Actor[] = [
      circler('ashigaru', 'r-a', -2, 0, 2.2, 1.25, { lantern: true }),
      circler('player', 'r-p', 2, 0, 1.8, 2.6, {}),
      circler('samurai', 'r-s', 0, -3, 1.6, 1.2, {}),
      still('nobunaga', 'r-n', 0, 3, 90, { stance: 'sit' }),
      circler('ranmaru', 'r-r', 4.5, 3, 1.4, 1.1, {}),
    ];
    return {
      actors,
      warmup: 0,
      camera: (cam) => lookFrom(cam, new Vector3(0, 5, 10), new Vector3(0, 1, 0), 45),
      lookAt: new Vector3(0, 1, 0),
    };
  },
};
