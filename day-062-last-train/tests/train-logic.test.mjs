import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrainTime,
  calculateTotalLossMinutes,
  calculateDeadline,
  getStatusLevel,
  formatTimeDisplay,
  getFirstTrainRemainingMs,
  DEFAULT_LOSS_ITEMS
} from '../lib/train-logic.js';

describe('終電サドンデス (train-logic)', () => {
  describe('parseTrainTime', () => {
    it('同日夜の時刻を正しくパースできる', () => {
      const base = new Date('2026-10-09T20:00:00');
      const parsed = parseTrainTime('23:45', base);
      assert.equal(parsed.getFullYear(), 2026);
      assert.equal(parsed.getMonth(), 9);
      assert.equal(parsed.getDate(), 9);
      assert.equal(parsed.getHours(), 23);
      assert.equal(parsed.getMinutes(), 45);
    });

    it('夜から翌日未明（00:30）の時刻を翌日として補正する', () => {
      const base = new Date('2026-10-09T22:30:00');
      const parsed = parseTrainTime('00:30', base);
      assert.equal(parsed.getDate(), 10);
      assert.equal(parsed.getHours(), 0);
      assert.equal(parsed.getMinutes(), 30);
    });

    it('不正な時刻形式ではエラーを投げる', () => {
      assert.throws(() => parseTrainTime('invalid'));
      assert.throws(() => parseTrainTime('99:99'));
    });
  });

  describe('calculateTotalLossMinutes', () => {
    it('デフォルトのロス合計を正しく算出する', () => {
      // bill(5) + coat(3) + walk(7) + wicket(3) = 18分（toiletはデフォルトfalse）
      const total = calculateTotalLossMinutes(DEFAULT_LOSS_ITEMS);
      assert.equal(total, 18);
    });

    it('カスタム徒歩分数が反映される', () => {
      const total = calculateTotalLossMinutes(DEFAULT_LOSS_ITEMS, 12);
      // 5 + 3 + 12 + 3 = 23分
      assert.equal(total, 23);
    });

    it('チェックを外した項目は除外される', () => {
      const items = {
        ...DEFAULT_LOSS_ITEMS,
        bill: { ...DEFAULT_LOSS_ITEMS.bill, enabled: false },
        toilet: { ...DEFAULT_LOSS_ITEMS.toilet, enabled: true }
      };
      // coat(3) + walk(7) + wicket(3) + toilet(4) = 17分
      const total = calculateTotalLossMinutes(items);
      assert.equal(total, 17);
    });
  });

  describe('calculateDeadline', () => {
    it('終電時刻からロスト分数を正しく引いたデッドラインを返す', () => {
      const train = new Date('2026-10-09T23:50:00');
      const deadline = calculateDeadline(train, 20); // 20分前
      assert.equal(deadline.getHours(), 23);
      assert.equal(deadline.getMinutes(), 30);
    });
  });

  describe('getStatusLevel', () => {
    it('30分以上は safe', () => {
      assert.equal(getStatusLevel(35 * 60 * 1000), 'safe');
    });

    it('15分〜30分は caution', () => {
      assert.equal(getStatusLevel(20 * 60 * 1000), 'caution');
    });

    it('5分〜15分は critical', () => {
      assert.equal(getStatusLevel(10 * 60 * 1000), 'critical');
    });

    it('5分未満は suddendeath', () => {
      assert.equal(getStatusLevel(3 * 60 * 1000), 'suddendeath');
    });

    it('0以下は gameover', () => {
      assert.equal(getStatusLevel(0), 'gameover');
      assert.equal(getStatusLevel(-5000), 'gameover');
    });
  });

  describe('formatTimeDisplay', () => {
    it('ミリ秒を正しくフォーマットする', () => {
      const ms = (1 * 3600 + 23 * 60 + 45) * 1000 + 600; // 01:23:45.6
      const formatted = formatTimeDisplay(ms);
      assert.equal(formatted.hours, '01');
      assert.equal(formatted.minutes, '23');
      assert.equal(formatted.seconds, '45');
      assert.equal(formatted.tenths, '6');
      assert.equal(formatted.sign, '');
    });

    it('マイナス時刻も正しくフォーマットする', () => {
      const formatted = formatTimeDisplay(-65000); // -1分05秒
      assert.equal(formatted.sign, '-');
      assert.equal(formatted.minutes, '01');
      assert.equal(formatted.seconds, '05');
    });
  });

  describe('getFirstTrainRemainingMs', () => {
    it('現在時刻から朝5時までのミリ秒を正しく計算する', () => {
      const now = new Date('2026-10-09T01:00:00');
      const remaining = getFirstTrainRemainingMs(now);
      assert.equal(remaining, 4 * 3600 * 1000); // 4時間
    });
  });
});
