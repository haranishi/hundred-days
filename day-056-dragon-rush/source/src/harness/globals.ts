// OWNER: harness
// 撮影ツール・E2E・性能計測がページから読む値。名前は tools/ と e2e/ と共有の契約なので変えない。
import type { InputApi } from './inputApi';
import type { ScriptStep } from './playtest';
import type { PlayState } from './stateProbe';

export interface ShotInfo {
  /** 1コマの描画命令数（影・鏡像・後処理を含む） */
  calls: number;
  /** 1コマの三角形数 */
  triangles: number;
  name: string;
  quality: string;
  gpu: string;
  /** 準備にかかった時間（ms） */
  readyMs: number;
  width: number;
  height: number;
  /** 破壊の場面を作った構図だけ：効果の数 */
  fx?: { additive: number; soft: number; debris: number; rubble: number };
}

export interface PerfResult {
  seconds: number;
  frames: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsMax: number;
  fpsMean: number;
  calls: number;
  triangles: number;
  jsHeapMB: number | null;
  /** ページの読み込み開始から最初のコマまで（ms） */
  firstFrameMs: number;
  quality: string;
  gpu: string;
  width: number;
  height: number;
}

/** tools/play.mjs が遊びを止めて撮るための口。 */
export interface PlayControl {
  /** true の間、シミュレーションを止める（描画は続ける）。スクショを決まった時刻で撮るため */
  freeze(on: boolean): void;
  /** r03-roster：出来事 type が（この呼び出しから数えて）n 回目に出てから after 秒（ゲーム内時刻、既定 0）たった刻みで止める。技を出している瞬間を撮るため */
  freezeOn(type: string, n: number, after?: number): void;
  /** いま止まっているか */
  readonly frozen: boolean;
}

declare global {
  interface Window {
    __dragonPublicBase?: string;
    __appReady?: boolean;
    __firstFrameMs?: number;
    __appError?: string;
    __shotReady?: boolean;
    __shotInfo?: ShotInfo;
    __filmReady?: boolean;
    __filmFrame?: number;
    __filmStep?: () => Promise<number>;
    /** r03-fx：破壊の連番で、いまのコマの効果の数（fx の stats と、詳しい形で描いている崩れる建物の数） */
    __filmFx?: Record<string, unknown>;
    __perfResult?: PerfResult;
    /** 撮影モードで、今の構図を n コマ描いた1コマの時間（ms、GPU の完了まで待つ）。描画の重さの比べ用 */
    __bench?: (frames: number) => Promise<{ p50: number; p95: number; mean: number }>;
    /** 遊びの状態（毎コマ更新）。tools/play.mjs と E2E が読む */
    __state?: PlayState;
    /** 入力の注入口（ポインタロックが使えないとき用） */
    __input?: InputApi;
    /** ?playtest=script で流す台本（ページを開く前に addInitScript で置く） */
    __playtestScript?: ScriptStep[];
    __play?: PlayControl;
    /** 撮影モードで最後に保存した PNG（検証用） */
    __lastPhoto?: { name: string; bytes: number };
    /** 調べもの用：組み立て済みのアプリ（撮影ツールは使わない） */
    __app?: unknown;
  }
}

export {};
