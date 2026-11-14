/**
 * camera-check の公開窓口。
 * 画面側は `loadCameraCheck()` で部品を動的に読み込み、使えなければ「自分でやってみる」に切り替える。
 */
import type { ComponentType } from 'preact';
import type { Handedness } from '../hand/types';
import type { SignItem } from '../content/types';
import { createTarget } from './match';

export interface CameraCheckProps {
  item: SignItem;
  dominant: Handedness;
  /** 目標の形と0.5秒続けて一致した */
  onSuccess(): void;
  /** 「できた（自分で判断）」を選んだ */
  onSelfJudge(): void;
  /** 「スキップ」を選んだ */
  onSkip(): void;
  /** カメラが使えない（許可されない・無い・読み込み失敗）。理由は画面に出す日本語 */
  onUnavailable(reason: string): void;
}

/** この端末でカメラ問題を出せるか（カメラの API があり、安全な接続か） */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof isSecureContext === 'undefined' || isSecureContext);
}

/** この教材を、安定した特徴で見間違えやすい形と区別できるか。 */
export function cameraTargetSupported(item: SignItem): boolean {
  return createTarget(item).status === 'supported';
}

/** カメラの部品を遅れて読み込む。MediaPipeは部品内で開始操作の後に読み込む。 */
export async function loadCameraCheck(): Promise<ComponentType<CameraCheckProps> | null> {
  return (await import('./CameraCheck')).CameraCheck;
}
