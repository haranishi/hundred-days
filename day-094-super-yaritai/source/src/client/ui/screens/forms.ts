// 入力欄の整え方（純粋な関数。単体試験で確かめる）。
// - 名前：友だちの部屋で本人が入れる。8文字（見た目の1文字＝書記素）まで、制御文字・改行・見えない文字は消す
// - あいことば：正本は src/shared/roomcode.ts（ネット担当）。そろえ方・使う文字・長さはそこから読み、
//   ここは入力のしやすさ（招待のURLの貼り付け・打ち間違いの知らせ方）だけを足す
// 部屋の側（ネット担当）でも同じ規則で確かめ直す。

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode as normalizeShared } from '../../../shared/roomcode';

export { ROOM_CODE_LENGTH };
export const NAME_MAX_CHARS = 8;

/**
 * あいことばに使わない英字と数字（読み違えやすい文字。いまは 0・O・1・I・L）。
 * 知らせる文で見比べやすいよう、似た形どうし（0とO、1とIとL）を隣に並べる順で調べる
 */
export const ROOM_CODE_EXCLUDED = [...'0O1IL23456789ABCDEFGHJKMNPQRSTUVWXYZ'].filter((c) => !ROOM_CODE_ALPHABET.includes(c));

/**
 * 消す文字：制御文字（改行・タブを含む）、行・段落の区切り、片方だけのサロゲート、
 * 見えない文字（ゼロ幅スペース・文字の向きを変える記号・BOM・ハングルの埋め字・点字の空白など）。
 * 絵文字をつなぐゼロ幅接合子（U+200D）は絵文字の形に要るので残す。
 */
const INVISIBLE =
  /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFEFF\uFFA0]/gu;

/** 見た目の1文字（書記素）に分ける。Intl.Segmenter がない環境ではコードポイントで分ける */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text), (x) => x.segment);
  }
  return Array.from(text);
}

/** 書記素の数（入力欄の「3/8」に使う） */
export function graphemeCount(text: string): number {
  return splitGraphemes(text).length;
}

/**
 * 入力中の名前を整える（打っている途中なので、前後の空白は消さない）。
 * 見えない文字を消し、続く空白を1つにまとめ、8文字までに切る。
 */
export function cleanNameInput(input: string): string {
  const base = input.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ');
  return splitGraphemes(base).slice(0, NAME_MAX_CHARS).join('');
}

/** 決めた名前を整える。前後の空白も消す。何も残らなければ空文字 */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return cleanNameInput(input.replace(INVISIBLE, '').trim()).trim();
}

/** 貼り付けた招待のURL（…?room=K7QM）からも、あいことばを取り出す */
function fromUrl(text: string): string | null {
  const m = /[?&]room=([^&#\s]+)/i.exec(text);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1] ?? '');
  } catch {
    return m[1] ?? '';
  }
}

/**
 * 入力されたあいことばを整える：URL なら room= の値を取り出す → 共通のそろえ方（roomcode.ts：全角→半角・大文字・
 * 空白とハイフンを除く）→ 英字と数字以外を消す → 決まった長さまで。
 * 読み違えやすい文字は消さずに残す（勝手に消すと、どこを打ち間違えたかわからなくなる）。
 */
export function normalizeRoomCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  const raw = fromUrl(input) ?? input;
  return normalizeShared(raw)
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export type RoomCodeProblem = 'empty' | 'short' | 'confusable' | null;

/** 整えたあいことばの問題。null なら「入る」を押せる（最後の判定は roomcode.ts の isValidRoomCode） */
export function roomCodeProblem(code: string): RoomCodeProblem {
  if (code.length === 0) return 'empty';
  if ([...code].some((c) => ROOM_CODE_EXCLUDED.includes(c))) return 'confusable';
  if (code.length < ROOM_CODE_LENGTH) return 'short';
  return isValidRoomCode(code) ? null : 'confusable';
}

/** 画面に出す案内（問題がなければ空文字） */
export function roomCodeHint(problem: RoomCodeProblem): string {
  switch (problem) {
    case 'confusable':
      return `あいことばに ${ROOM_CODE_EXCLUDED.join('・')} は入っていません。もう一度見比べてください`;
    case 'short':
      return `${ROOM_CODE_LENGTH}文字そろうと「入る」を押せます`;
    default:
      return '';
  }
}
