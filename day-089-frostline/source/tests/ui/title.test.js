import { it, expect } from 'vitest';
import { titleContent, controlGuide } from '../../src/ui/title.js';
it('読み込み完了まで始められず失敗時に再読込を案内', () => {
  expect(titleContent({ progress: .51 }).status).toContain('51％');
  expect(titleContent({ progress: 1 }).disabled).toBe(true);
  expect(titleContent({ ready: true }).disabled).toBe(false);
  const failed = titleContent({ ready: true, failed: true }); expect(failed.disabled).toBe(true);
  expect(failed.status).toContain('読み直してください'); expect(titleContent().title).toBe('FROSTLINE');
});
it('3装置それぞれの早見が日本語で出る', () => {
  expect(controlGuide('keyboard')).toContain('左右キー'); expect(controlGuide('gamepad')).toContain('スティック');
  expect(controlGuide('touch')).toContain('左の舵');
});
