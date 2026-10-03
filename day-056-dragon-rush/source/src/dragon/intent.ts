// OWNER: dragon
// 竜の「意図」の口。遊びの側（src/gameplay）が毎刻み書き、竜の見た目（このフォルダ）はそれを読んで姿勢を作るだけにする。
// 見た目は物理や当たりを書き換えない。遊びの側は骨や形に触らない。モデルを作り直しても、この型を満たせば差し替えられる。
// 座標は m、角度はラジアン。向き（yaw）は +z（南）が 0 で、上から見て反時計回り（前 = (sin yaw, 0, cos yaw)）。

/** r03-roster：jump は飛べない怪獣（焔角）が跳んでいる間（屈むのは ground のまま、intent.jump の windup） */
export type DragonMode = 'ground' | 'air' | 'dive' | 'landing' | 'jump';
export type ActionPhase = 'none' | 'windup' | 'active' | 'recovery';
export type Gait = 'idle' | 'walk' | 'run';

export interface ActionIntent {
  phase: ActionPhase;
  /** 今の段階に入ってからの秒数 */
  time: number;
  /** 今の段階の長さ（秒）。time / duration で進みが分かる */
  duration: number;
}

export interface DragonIntent {
  /** 体の中心（モデルの原点）の位置 */
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  /** 体の前後の傾き（上が正）と横の傾き（右へ傾くのが正） */
  pitch: number;
  roll: number;
  /** 水平の速さ（m/s） */
  speed: number;
  mode: DragonMode;
  grounded: boolean;
  /** 足もとの地面の高さ（水の上では浅瀬の底） */
  groundY: number;
  /** 羽ばたきの位相（0〜1、0 が振り上げの頂点）と強さ（0〜1） */
  flapPhase: number;
  flapStrength: number;
  /** 歩きの位相（0〜1、4歩で1周。0 で後ろ左足が着く）と歩き方 */
  gaitPhase: number;
  gait: Gait;
  /** 首と頭を向ける先（世界の向きと俯仰）。炎は口からこの向きへ出る */
  aimYaw: number;
  aimPitch: number;
  /** 炎：charge は喉の光（0〜1）、active は口から炎が出ている、target は当たっている点 */
  breath: { charge: number; active: boolean; target: [number, number, number] | null };
  claw: ActionIntent;
  tail: ActionIntent;
  /** 地上の E（大技）。紅竜と雷翼は咆哮、焔角は地面を叩く（クリップは怪獣の設定の specialClip） */
  roar: ActionIntent;
  /** 跳ぶ（焔角の Space）：windup が屈む・active が上がる・recovery が落ちる。跳ばない怪獣は none のまま */
  jump: ActionIntent;
  /** 着地の衝撃（0〜1）。着地の瞬間に立ち、時間で 0 へ戻る */
  landingImpact: number;
}

const idleAction = (): ActionIntent => ({ phase: 'none', time: 0, duration: 0 });

export function createIntent(): DragonIntent {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    mode: 'air',
    grounded: false,
    groundY: 0,
    flapPhase: 0,
    flapStrength: 0.5,
    gaitPhase: 0,
    gait: 'idle',
    aimYaw: 0,
    aimPitch: 0,
    breath: { charge: 0, active: false, target: null },
    claw: idleAction(),
    tail: idleAction(),
    roar: idleAction(),
    jump: idleAction(),
    landingImpact: 0,
  };
}
