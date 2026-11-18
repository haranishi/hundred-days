// 入力欄の整え方（名前・あいことば）。src/client/ui/screens/forms.ts
import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, generateRoomCode, isValidRoomCode } from '../../src/shared/roomcode';
import {
  NAME_MAX_CHARS,
  ROOM_CODE_EXCLUDED,
  ROOM_CODE_LENGTH,
  cleanNameInput,
  graphemeCount,
  normalizeRoomCode,
  roomCodeHint,
  roomCodeProblem,
  sanitizeName,
} from '../../src/client/ui/screens/forms';

describe('名前', () => {
  it('8文字（見た目の1文字）までに切る', () => {
    expect(NAME_MAX_CHARS).toBe(8);
    expect(sanitizeName('あいうえおかきくけこ')).toBe('あいうえおかきく');
    expect(graphemeCount(sanitizeName('ＷＷＷＷＷＷＷＷＷＷ'))).toBe(8);
  });
  it('絵文字は1つで1文字と数え、途中で割らない', () => {
    const family = '👨‍👩‍👧‍👦';
    const name = sanitizeName(`${family.repeat(10)}`);
    expect(graphemeCount(name)).toBe(8);
    expect(name).toBe(family.repeat(8));
    expect(sanitizeName('👍🏽たろう')).toBe('👍🏽たろう');
  });
  it('制御文字・改行・タブ・見えない文字を消す', () => {
    expect(sanitizeName('たろ\nう')).toBe('たろう');
    expect(sanitizeName('た\tろう')).toBe('たろう');
    expect(sanitizeName('た\u0000ろ\u001bう')).toBe('たろう');
    expect(sanitizeName('​た‮ろう﻿')).toBe('たろう');
    expect(sanitizeName('た ろう')).toBe('たろう');
  });
  it('前後の空白を消し、続く空白は1つにまとめる', () => {
    expect(sanitizeName('  た  ろう  ')).toBe('た ろう');
    expect(sanitizeName('　たろう　')).toBe('たろう');
  });
  it('何も残らなければ空文字。文字列でなければ空文字', () => {
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('​​')).toBe('');
    expect(sanitizeName(undefined)).toBe('');
    expect(sanitizeName(42)).toBe('');
  });
  it('入力中は前後の空白を残す（打っている途中の空白を消さない）', () => {
    expect(cleanNameInput('たろう ')).toBe('たろう ');
    expect(cleanNameInput('あいうえおかきくけこ')).toBe('あいうえおかきく');
  });
});

describe('あいことば', () => {
  it('小文字は大文字に、全角は半角に、空白やハイフンは消す', () => {
    expect(normalizeRoomCode('k7qm')).toBe('K7QM');
    expect(normalizeRoomCode('ｋ７ｑｍ')).toBe('K7QM');
    expect(normalizeRoomCode(' k7 - qm ')).toBe('K7QM');
  });
  it('4文字までに切る', () => {
    expect(normalizeRoomCode('K7QMXYZ')).toBe('K7QM');
  });
  it('招待の URL を貼ったら room= の値を取り出す', () => {
    expect(normalizeRoomCode('https://day94.rairakku.com/?room=k7qm')).toBe('K7QM');
    expect(normalizeRoomCode('来て！ https://x.example/?debug=1&room=AB23#top')).toBe('AB23');
  });
  it('読み違えやすい文字（0・O・1・I・L）は消さずに残し、問題として知らせる', () => {
    expect(normalizeRoomCode('k0qm')).toBe('K0QM');
    expect(roomCodeProblem('K0QM')).toBe('confusable');
    expect(roomCodeProblem('KOQM')).toBe('confusable');
    expect(roomCodeProblem('K1QM')).toBe('confusable');
    expect(roomCodeProblem('KIQM')).toBe('confusable');
    expect(roomCodeProblem('KLQM')).toBe('confusable');
    expect(roomCodeHint('confusable')).toContain('0・O・1・I・L');
  });
  it('4文字そろって、使う文字だけなら問題なし', () => {
    expect(roomCodeProblem('K7QM')).toBeNull();
    expect(roomCodeProblem('AB23')).toBeNull();
    expect(roomCodeProblem('K7Q')).toBe('short');
    expect(roomCodeProblem('')).toBe('empty');
  });
  it('文字列でなければ空文字', () => {
    expect(normalizeRoomCode(null)).toBe('');
    expect(normalizeRoomCode(1234)).toBe('');
  });
});

describe('あいことば：正本（src/shared/roomcode.ts）と食い違わない', () => {
  it('部屋が作るあいことばは、どれも画面の検査を通る', () => {
    // 決まった並びの乱数で 500 個作る
    let x = 12345;
    const rand = (max: number): number => {
      x = (x * 1103515245 + 12345) >>> 0;
      return x % max;
    };
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(rand);
      expect(roomCodeProblem(normalizeRoomCode(code.toLowerCase()))).toBeNull();
      expect(isValidRoomCode(normalizeRoomCode(code))).toBe(true);
    }
  });
  it('使わない文字の一覧は、正本の文字の表に1つも入っていない', () => {
    expect(ROOM_CODE_EXCLUDED).toEqual(['0', 'O', '1', 'I', 'L']);
    for (const c of ROOM_CODE_EXCLUDED) expect(ROOM_CODE_ALPHABET.includes(c)).toBe(false);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });
  it('正本と同じそろえ方（長音の「ー」や全角のハイフンも消す）', () => {
    expect(normalizeRoomCode('K7ーQM')).toBe('K7QM');
    expect(normalizeRoomCode('ｋ７－ｑｍ')).toBe('K7QM');
  });
});
