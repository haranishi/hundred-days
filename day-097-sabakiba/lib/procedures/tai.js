// 大きなタイの硬い小骨は、骨の列を細い帯として取る。
import { SPECIES_META } from '../species/meta.js';
import {
  clearBlade, cut, freeFillet, gut, hand, headSide, move, openEdge, peel, pinbones, practice, prep,
  ribs, sashimiKnife, scaleSide, wash,
} from './aji.js';

const k = SPECIES_META.tai.sizeCm.typical / 21;
const holdBody = [hand('bodyCenter', '{L}手で胴を支え、指先を刃筋から外します。')];

export default { steps: [
  prep(['deba', 'scaler', 'yanagi', 'tweezers'], '出刃包丁、うろこ取り、透明な袋、ペーパーを用意します。仕上げには骨抜きと柳刃包丁を使います。', {
    tip: '魚が入る袋や大きなたらいを用意すると、硬いうろこが飛び散りにくくなります。',
  }),
  scaleSide('L', {
    how: ['袋の中でえらぶたの外を支え、うろこ取りを尾から頭へ短く当てます。',
      '背びれのとげに触れないようにし、胸びれの陰と腹の縁も払います。'],
    mistake: '大きく勢いをつけてこすると、硬いうろこが周りに飛びます。',
  }), scaleSide('R', { tip: '裏面も袋に収めたまま、腹と胸びれの下に硬いうろこが残っていないか見ます。' }),
  headSide(k, 'L', false, { hands: holdBody }), headSide(k, 'R', true, {
    hands: holdBody, tip: '硬くて刃が止まる所では、力を足す前に刃を抜き、首の関節を探します。', safety: clearBlade,
  }),
  gut(k), wash(k),
  openEdge('R', 'ventralCut'), freeFillet(k, 'R', 'dorsalCut', true, {
    tip: '硬い腹骨と背骨の継ぎ目は、場所が見えてから切っ先で一本ずつ切ります。',
  }),
  openEdge('L', 'ventralCut'), freeFillet(k, 'L', 'dorsalCut', true),
  ribs(k, { tip: '腹骨の端を少し浮かせ、骨の丸みに刃を合わせると、厚い腹の身を残せます。' }),
  pinbones(k, {
    title: '硬い小骨を帯で取ります', summary: '大きなタイの身の中央に並ぶ硬い小骨は、列の両脇に刃を入れて細い帯で取り除きます。',
    how: ['皮を下に置き、指で骨の列を探します。柳刃包丁の中ほどを使い、列の脇を頭側から尾へ引きます。',
      'もう一方の脇も切って帯を外します。切り口をなで、骨先が触れたら身を支えながら骨抜きで骨の傾きに沿って抜きます。',
      'もう片方の身でも同じように骨の列を外し、指で確かめます。'],
    tip: '先に指で骨先を探ると、帯に取る幅を細くできます。',
    mistake: '中央を大きく切り落とすと、骨のない背身と腹身まで帯に付きます。',
    done: '帯が外れ、背身と腹身の切り口に硬い先が触れません。',
    cuts: [cut('band-r', 'pinBoneLine', 'R', 'yanagi', 'slice', 'mid', 10, [0.16, 0.30], true),
      cut('pluck-r', 'pinBoneLine', 'R', 'tweezers', 'pluck', 'tip', 16, [0.33, 0.44], true),
      cut('band-l', 'pinBoneLine', 'L', 'yanagi', 'slice', 'mid', 10, [0.57, 0.70], true),
      cut('pluck-l', 'pinBoneLine', 'L', 'tweezers', 'pluck', 'tip', 16, [0.73, 0.84], true)],
    moves: [move(k, 'pinbones.R', [-1, 1, 1], [0.46, 0.56], { opacity: 0, visible: false }),
      move(k, 'pinbones.L', [1, 1, 1], [0.85, 0.98], { opacity: 0, visible: false })],
    practice: practice('band-r', 0.4),
  }),
  peel(k, false, { summary: '焼く分は皮付きで取り分け、生食用で刺身にする分は尾から皮を引きます。', safety: sashimiKnife }),
] };
