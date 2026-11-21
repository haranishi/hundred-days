// サバは硬い腹骨の継ぎ目を切り、加熱用としめ鯖用の仕上げを分ける。
import { SPECIES_META } from '../species/meta.js';
import {
  LB, freeFillet, gut, hand, headSide, mark, openEdge, peel, pinbones, prep, ribs, scaleSide, shot, step, wash,
} from './aji.js';

const k = SPECIES_META.saba.sizeCm.typical / 21;
const joint = {
  tip: '腹骨が背骨につながる所で抵抗が出ます。刃を止めて継ぎ目を見つけ、切っ先で短く切ります。',
  mistake: '引っかかったまま押し続けると、刃が柔らかい身の方へそれます。',
};

export default { steps: [
  prep(['deba', 'scaler', 'tweezers'], '出刃包丁の柄に緩みがないか確かめ、うろこ取り、骨抜き、清潔な調理用ブラシ、冷やしたバットを用意します。', {
    tip: '冷蔵庫からは、今さばく一尾だけを出します。',
    safety: 'できたヒスタミンは加熱しても残ります。保冷が途切れて傷みが疑われる魚は食べません。',
  }),
  scaleSide('L', {
    summary: 'サバの細かなうろこを、尾から頭へ軽く払います。',
    tip: '胸びれや背びれの根元に残った丸いうろこを探します。',
    mistake: '銀色の模様まで落とそうとこすると、皮を傷めます。',
  }),
  scaleSide('R'),
  headSide(k, 'L', false), headSide(k, 'R', true),
  gut(k, { tip: 'えらが付いた頭とわたを先に分け、作業を中断するときは身を冷蔵します。' }),
  wash(k, true),
  openEdge('R', 'ventralCut'), freeFillet(k, 'R', 'dorsalCut', false, joint),
  openEdge('L', 'dorsalCut'), freeFillet(k, 'L', 'ventralCut', false, {
    tip: '身を高く持ち上げず、手のひらで支えると、身割れを抑えられます。',
  }),
  ribs(k, { tip: '硬い腹骨の根元を切っ先で少し浮かせると、骨の下に刃の中ほどが入ります。' }),
  pinbones(k),
  step({
    id: 'choose-finish', title: '料理に合わせて整えます', summary: '塩焼きとみそ煮の分を皮付きで取り分け、しめ鯖(さば)用の身は冷蔵庫で締めます。',
    how: ['加熱用の片身は皮を残したまま、冷たい皿へ移します。',
      'しめ鯖用には、生食用でアニサキス対策の冷凍処理を確認した身を使います。',
      '身に塩を当てて冷蔵し、塩を洗って水を拭きます。酢に浸す間も冷蔵します。'],
    tip: '皮をむくのはしめ鯖です。塩焼きやみそ煮にする分は、ここで下ごしらえを終えます。',
    mistake: '酢で身が白くなっても、アニサキスは死滅しません。',
    done: '加熱用は皮付きで分けてあり、しめ鯖用は塩と酢で締まっています。',
    place: 'しめ鯖用は皮を下にしてバットに置きます。', pose: LB,
    hands: [hand('bodyCenter', '{L}手で身を下から支えます。', 'L.dorsal')],
    labels: [mark('piece:L.dorsal', '片身(かたみ)')], camera: shot('top', 'bodyCenter', 0.88), durationMs: 3800,
  }),
  peel(k, true, {
    title: 'しめ鯖の薄皮をむきます', summary: '酢で締めた生食用の身を皮が上になるように置き、表面の薄い膜だけをむきます。',
    tip: '頭側の切り口で薄皮の端を探し、身に銀色の模様が残るよう低く引きます。',
  }),
] };
