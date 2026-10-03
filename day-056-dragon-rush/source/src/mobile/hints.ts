import type { CreatureId } from '../config/creatures';
import type { CoachStep } from '../gameplay/coach';

export function touchCoachLine(step: CoachStep, grounded: boolean, creature: CreatureId): [string, string][] {
  switch (step) {
    case 'move': return [['左の丸', 'で移動・'], ['右の面', 'をなぞって見回す']];
    case 'breath': return [['主砲を長押し', creature === 'raiyoku' ? 'で雷をつなぐ' : creature === 'homuratsuno' ? 'で溶岩を投げる' : 'で炎を吐く']];
    case 'claw': return !grounded && creature !== 'homuratsuno'
      ? [['急降下', 'で着地して、'], ['近接', 'で攻撃']]
      : [['近接', creature === 'raiyoku' ? 'で翼を振る' : creature === 'homuratsuno' ? 'で角を突く' : 'で爪を振る']];
    case 'fly': return creature === 'homuratsuno'
      ? [['上昇／跳ぶ', 'でのしかかる・'], ['急降下／突進', 'と移動で突進']]
      : [['上昇／跳ぶを長押し', 'で飛ぶ・'], ['下降', 'でゆっくり降りる']];
    case 'rage': return [['大技', creature === 'raiyoku' ? 'で落雷（怒りが満タン）' : creature === 'homuratsuno' ? 'で地割れ（怒りが満タン）' : 'を押す（怒りが満タン）']];
    default: return [];
  }
}

export const TOUCH_GUIDE: [string, string][] = [
  ['左の丸', '移動（斜めにも動けます）'], ['右の面', 'なぞって見回す（感度・上下反転は下で調整）'],
  ['主砲', '長押しで炎／雷／溶岩'], ['近接・尾', '爪／翼／角、尾で攻撃'],
  ['上昇／跳ぶ', '長押しで上昇。溶背はジャンプ'], ['下降', 'ゆっくり降りる（溶背には不要）'],
  ['急降下／突進', '空中で急降下。地上で移動と合わせて走る'], ['大技', '怒りが満タンで発動'],
  ['一時停止', '音量・視点を調整、再開／やり直し'],
];
