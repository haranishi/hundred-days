export const DURATION = 30;
export const FPS = 30;
export const CAPTIONS = [
  [0, 'この一部で、わかる？'],
  [3, '少しずつ、全体へ。'],
  [6, '答えたら、本物の一枚。'],
  [10, '生まれた背景まで読める'],
  [16, '名画を30作品に増やしました'],
  [21, '「姉妹」でも、姉妹じゃない。'],
  [26, '今日の5作品、見に行こう。'],
];
export const captionAt = t => CAPTIONS.findLast(([start]) => start <= t)[1];
