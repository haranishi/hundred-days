/**
 * ブラウザ側の部品どうしの境目（docs/06_作り方と検証.md）。
 * - ScreensAPI：タイトル〜結果の画面（担当：画面と音）。app.ts（担当：ゲームの芯）が呼ぶ
 * - AudioAPI：効果音とBGM（担当：画面と音）。描画とHUDが GameEvent を見て呼ぶ
 * - GameSession：ひとり・部屋の主・参加者の違いを隠す（第1波は Local だけ。Host/Guest は第2波でネット担当が足す）
 * 形を変えたいときは、理由を書いて設計者に返す。
 */
import type { InputState } from '../shared/input';
import type { CpuLevel, MatchResult, ModelKey, SfxName, WorldStatic, WorldView } from '../shared/view';

// ───────── 音 ─────────

export type BgmKind = 'title' | 'game';
export type LoopName = 'cart' | 'freezer';

export interface AudioAPI {
  /** 最初のタップ・キー入力で呼ぶ（iOS では利用者の操作の中でしか音を出せない） */
  unlock(): void;
  /**
   * pitch は音程の倍率（1＝元の高さ）。'combo-up' で pitch を省くと、続けて呼ばれた回数に応じて自動で上がる。
   * ボタンの「ポチ」と結果のファンファーレは画面（ScreensAPI）が自分で鳴らすので、呼ぶ側は重ねて鳴らさない。
   */
  play(name: SfxName, opts?: { volume?: number; pan?: number; pitch?: number }): void;
  /** 鳴らし続ける音の大きさ（0で止まる）。カートの走行音など */
  setLoop(name: LoopName, gain: number): void;
  startBgm(kind: BgmKind): void;
  stopBgm(): void;
  /** 0＝ふつう、1＝店長が出た、2＝ラストスパート（速くなる） */
  setBgmIntensity(level: 0 | 1 | 2): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

// ───────── 画面 ─────────

export interface CharacterChoice {
  key: ModelKey;
  label: string;
}

export interface LobbyPlayer {
  slot: number;
  name: string;
  character: ModelKey;
  isHost: boolean;
  isYou: boolean;
  connected: boolean;
}

export interface LobbyModel {
  code: string;
  /** 招待のURL（?room=CODE） */
  url: string;
  players: LobbyPlayer[];
  isHost: boolean;
  /** 試合の長さ（秒）：90・120・180 */
  duration: number;
  canStart: boolean;
}

/**
 * 画面が開いている間は #screens に data-screen 属性が付き、Esc は画面が受け取る（一時停止中は「つづける」、ほかは「もどる」）。
 * ゲームの入力はその間 Esc を見ない。
 */
export interface ScreensAPI {
  showTitle(h: {
    onSolo(): void;
    onFriends(): void;
    onRandom(): void;
    onHowTo(): void;
    onToggleMute(): void;
    muted: boolean;
  }): void;
  showHowTo(h: { onBack(): void }): void;
  showSoloSetup(h: { onStart(level: CpuLevel, character: ModelKey): void; onBack(): void }): void;
  /** 友だちと：名前とキャラを決めて、部屋を作るか、あいことばで入る */
  showFriendMenu(h: {
    presetCode?: string;
    savedName?: string;
    onCreate(name: string, character: ModelKey): void;
    onJoin(code: string, name: string, character: ModelKey): void;
    onBack(): void;
  }): void;
  showMatchmaking(h: { onCancel(): void; onPlayCpu(): void }): {
    setState(state: 'searching' | 'timeout' | 'error', secondsLeft?: number): void;
  };
  showLobby(model: LobbyModel, h: { onStart(): void; onLeave(): void; onDuration(sec: number): void }): {
    update(model: LobbyModel): void;
  };
  showConnecting(text: string, onCancel?: () => void): void;
  showError(text: string, onBack: () => void): void;
  /**
   * live：試合が止まらない（ネット対戦）。省略なら false＝ひとりで遊ぶときの一時停止。
   * true のときは「試合は止まりません」と出し、「やめる」の確認は「この試合にはもどれません」になる
   * （2026-10-06 画面と音の担当が追加。省略可なので、渡さなければ今までどおり）
   */
  showPause(h: { onResume(): void; onQuit(): void; live?: boolean }): void;
  showResults(
    result: MatchResult,
    h: { mySlot: number; canRematch: boolean; waitingForHost: boolean; onRematch?(): void; onTitle(): void },
  ): void;
  /** ゲーム中は全部の画面を隠す（ゲーム中の表示は HUD の担当） */
  hide(): void;
  toast(text: string): void;
}

/** プレイヤーが選べるキャラ（docs/04） */
export const PLAYER_CHARACTERS: readonly CharacterChoice[] = [
  { key: 'ch/character-female-b', label: 'ミカン' },
  { key: 'ch/character-male-f', label: 'ケンタ' },
  { key: 'ch/character-female-f', label: 'ユイ' },
  { key: 'ch/character-male-a', label: 'ダイチ' },
  { key: 'ch/character-female-e', label: 'サクラ' },
  { key: 'ch/character-male-e', label: 'ハカセ' },
];

// ───────── 試合 ─────────

export interface GameSession {
  readonly mode: 'solo' | 'host' | 'guest';
  /** この端末で操作する slot */
  readonly mySlot: number;
  readonly world: WorldStatic;
  /** 経過秒 dt だけ進め、描画用の見え方を返す */
  update(dt: number, input: InputState): WorldView;
  /** 試合が終わっていれば結果 */
  result(): MatchResult | null;
  dispose(): void;
}
