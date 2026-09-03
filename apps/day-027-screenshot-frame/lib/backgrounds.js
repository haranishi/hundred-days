export const BACKGROUNDS = [
  { id: 'grape', name: '葡萄', type: 'gradient', colors: ['#667eea', '#764ba2'] },
  { id: 'sunset', name: '夕焼け', type: 'gradient', colors: ['#f6d365', '#fda085'] },
  { id: 'coral', name: '珊瑚', type: 'gradient', colors: ['#ff9a9e', '#fecfef'] },
  { id: 'ocean', name: '海', type: 'gradient', colors: ['#4facfe', '#00f2fe'] },
  { id: 'forest', name: '森', type: 'gradient', colors: ['#0ba360', '#3cba92'] },
  { id: 'midnight', name: '夜', type: 'gradient', colors: ['#0f2027', '#2c5364'] },
  { id: 'peach', name: '桃', type: 'gradient', colors: ['#ffecd2', '#fcb69f'] },
  { id: 'paper', name: '紙', type: 'solid', colors: ['#f5f1e8'] },
  { id: 'graphite', name: '墨', type: 'solid', colors: ['#1c1c1e'] },
  { id: 'transparent', name: '透明', type: 'transparent', colors: [] }
];

export const DEFAULT_BACKGROUND = 'grape';

export function findBackground(id) {
  return BACKGROUNDS.find((background) => background.id === id) ?? BACKGROUNDS[0];
}
