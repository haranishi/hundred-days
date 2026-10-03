export const DURATION_SECONDS = 32;
export const FPS = 30;
export const TITLE = '夕暮れ破壊紀行';
export const CUTS = [
  { creature: 'kurenai', from: 10, duration: 3, lines: ['今日は、街を壊す側。', '怪獣になって大暴れ'] },
  { creature: 'kurenai', from: 4, duration: 5, lines: ['紅竜は、炎と飛行。'] },
  { creature: 'raiyoku', from: 0, duration: 7, lines: ['雷翼は、雷を連ねる。'] },
  { creature: 'homuratsuno', from: 4, duration: 9, lines: ['溶背は、溶岩と地割れ。'] },
  { creature: 'kurenai', from: 6, duration: 5, lines: ['3体から選んで大暴れ。', 'PC用の3D怪獣ゲーム'] },
  { creature: 'raiyoku', from: 9, duration: 3, lines: ['PCのブラウザで遊べます', 'キーボード＋マウスで操作'] },
];
export const DEMO_CUTS = [
  { creature: 'kurenai', from: 10, duration: 3 },
  { creature: 'kurenai', from: 4, duration: 3 },
  { creature: 'raiyoku', from: 0, duration: 3 },
  { creature: 'homuratsuno', from: 5, duration: 6 },
  { creature: 'raiyoku', from: 9, duration: 3 },
];

if (CUTS.reduce((s, c) => s + c.duration, 0) !== DURATION_SECONDS) throw new Error('Timeline duration mismatch');
for (const cut of CUTS) {
  if (cut.lines.length > 2 || cut.lines.some(line => [...line].length > 16)) throw new Error('Caption exceeds the safe line limit');
}
