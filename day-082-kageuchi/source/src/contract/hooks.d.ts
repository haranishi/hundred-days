// OWNER: contract（r01-integrate で一本化）
// window に足す口（撮影・自動操作・E2E・確認ページ）の宣言は、ここ1か所だけに置く。
// 同じ名前を担当ごとに別の型で宣言すると、全体の型検査（tsc -p tsconfig.json）が落ちるため。各所では宣言しない。
import type { Route } from '../game/autopilot';
import type { GameStateOut } from '../game/state';
import type { AutomationInput } from '../input/input';

/** デバッグの口（main.ts）：E2E・撮影・自動プレイが使う。 */
export interface GameDebugApi {
  teleport(x: number, z: number, yawDeg?: number): void;
  win(): void;
  lose(): void;
  /** sim を止める／動かす（自動プレイの道具が、決まった時刻の絵を撮るため）。 */
  freeze(on: boolean): void;
  /** 止めたまま n 刻み進める（入力は今の状態）。 */
  step(n: number): void;
  setCrouch(on: boolean): void;
  setSpeed(n: number): void;
  /** 画面を進める（E2E 用）：start→select→briefing→play */
  goto(screen: 'select' | 'briefing' | 'play'): void;
  /** 表示の数（描画命令・三角形・作ったシェーダー）。 */
  viewStats(): { calls: number; triangles: number; programs: number };
  /** 作ったシェーダーの名前と鍵の頭（先作りの漏れを調べる）。 */
  programList(): string[];
  /** 調べ用：カメラを構図（注視点・向き・見下ろし・距離・画角）に固定する。null で追従へ戻す。 */
  look(shot: { target: [number, number, number]; yawDeg: number; pitchDeg: number; distance: number; fov?: number } | null): void;
}

/** 道順の台本を流す自動操作（tools/play.mjs が使う）。読むのは __state、書くのは __input だけ。 */
export interface AutopilotApi {
  start(route: Route): void;
  stop(): void;
  status(): { status: string; step: number; failReason: string | null; log: { t: number; step: number; text: string }[] } | null;
}

/** 音の様子（E2E と調べ用）。started は最初の操作で音が始まったか、muted は M で消したか。 */
export interface AudioDebugApi {
  readonly started: boolean;
  readonly muted: boolean;
  /** 鳴らした音の名前ごとの回数。 */
  readonly counts: Readonly<Record<string, number>>;
  /** AudioContext の状態（'running' など）。まだ作っていなければ 'none'。 */
  readonly state: string;
}

declare global {
  interface Window {
    // 遊びのページ（main.ts）
    __state?: GameStateOut;
    __input?: AutomationInput;
    __game?: GameDebugApi;
    __autopilot?: AutopilotApi;
    __audio?: AudioDebugApi;
    __appReady?: boolean;
    __appError?: string;
    /** 表示の準備（シェーダーの先作り）が終わり、描き始めた。 */
    __viewReady?: boolean;
    // 撮影と計測（遊びのページ・art.html・chars.html が共通に使う）
    __shotReady?: boolean;
    /** 中身は撮るページごとに違う（name・calls・triangles・gpu・t など）。 */
    __shotInfo?: Record<string, unknown>;
    __perfResult?: Record<string, unknown>;
    // 世界の確認ページ（art.html）
    __artError?: string;
    // 人物の確認ページ（chars.html）
    __labError?: string;
    __filmStep?: () => number;
    __filmReady?: boolean;
    __footSlip?: number;
    __footSlipInfo?: unknown;
  }
}
