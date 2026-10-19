// ヒント用：いまの配置で、いちばんずれているものを1つ名指しする。
//
// 正解の配置との差で選び、向きと大きさだけを言葉にする（cmの数字は言わない）。灯りは上下、道具は左右にしか動かないので、
// 「どれを・どちらへ」が分かれば次の一手が決まる。邪魔な道具の影が壁に残っているあいだは、それを先に言う。
import { maskArea } from './geometry.js';
import { solutionArrangement } from './score.js';

// 「だいぶ」の目安（cm）。灯りと道具のずれを同じ物差しで比べるための値。
const SCALE = 5;
// 邪魔な道具の影が残っているときの重み。ずれ30cm分より先に言う。
const DECOY_WEIGHT = 6;

export function sizeWord(delta) {
  const size = Math.abs(delta);
  if (size < 2.5) return 'ほんの少し';
  return size < 7 ? '少し' : 'だいぶ';
}

const sideOf = (sign) => (sign < 0 ? '左' : '右');

function sentence(top) {
  if (top.kind === 'lamp') {
    return top.delta > 0 ? `灯りが、${sizeWord(top.delta)}高い。下げてみよう。` : `灯りが、${sizeWord(top.delta)}低い。上げてみよう。`;
  }
  if (top.kind === 'decoy') return `${top.label}の影が、壁に残っている。壁の${sideOf(top.toward)}の端へすべらせよう。`;
  const side = Math.sign(top.delta);
  return `${top.label}が、${sizeWord(top.delta)}${sideOf(side)}にずれている。${sideOf(-side)}へすべらせよう。`;
}

// stage：場面、target：buildTarget の結果、assessment：evaluate の結果、arrangement：いまの配置。
export function diagnose(stage, target, assessment, arrangement) {
  const solution = solutionArrangement(stage);
  const targetArea = maskArea(target.union);
  const found = [];
  const lampDelta = arrangement.ly - solution.ly;
  found.push({ kind: 'lamp', id: 'lamp', delta: lampDelta, weight: Math.abs(lampDelta) / SCALE });
  for (const prop of stage.props) {
    if (prop.x.min === prop.x.max) continue;
    const x = arrangement.xs[prop.id];
    if (prop.decoy) {
      const area = assessment.parts[prop.id]?.area ?? 0;
      if (area > stage.threshold.decoyArea * targetArea) {
        found.push({ kind: 'decoy', id: prop.id, label: prop.label, toward: x < (prop.x.min + prop.x.max) / 2 ? -1 : 1, weight: DECOY_WEIGHT });
      }
      continue;
    }
    const delta = x - prop.x.solution;
    found.push({ kind: 'prop', id: prop.id, label: prop.label, delta, weight: Math.abs(delta) / SCALE });
  }
  found.sort((a, b) => b.weight - a.weight);
  const [top] = found;
  if (top.weight < 0.2) return { kind: 'none', id: null, text: '大きなずれは無い。灯りと道具を、1cmずつ動かして確かめよう。' };
  return { kind: top.kind, id: top.id, text: sentence(top) };
}
