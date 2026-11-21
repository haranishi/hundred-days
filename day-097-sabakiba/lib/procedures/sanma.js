// 腹と背から先に開くのは、調査にある全国さんま漁協の型。丸塩焼きの分岐は頭を落とす前に伝える。
import { SPECIES_META } from '../species/meta.js';
import {
  LB, cut, freeFillet, gut, hand, headLeft, keepCold, line, mark, move, openEdge, peel, pinbones,
  prep, ribs, scaleSide, shot, step, wash,
} from './aji.js';

const k = SPECIES_META.sanma.sizeCm.typical / 21;
function rinseScales(side) {
  const window = [0.30, 0.81];
  return scaleSide(side, {
    title: side === 'L' ? '水の中でうろこを払います' : '裏面とひれ際を洗います',
    summary: '指の腹で皮を軽くなで、ひれの際に残った薄いうろことぬめりを落とします。',
    how: ['水を張ったボウルで{L}手を頭に添え、{R}手の指の腹で尾から頭へなでます。',
      '落ちにくいうろこだけ小さな出刃包丁の先で軽くこそげ、水気を拭きます。'],
    tip: side === 'R' ? '保冷した新鮮な魚をすぐ丸塩焼きにするなら、頭とわたを残して塩を振り、腹の中心まで加熱します。'
      : 'ひれの付け根を見ながら、残っているうろこだけを払います。',
    mistake: side === 'R' ? 'わたを残したまま後日まで置くと傷みやすくなります。後で焼く分はわたを外して冷蔵します。'
      : '細い腹を握り込むと腹が破れます。頭に手を添えて支えます。',
    tools: ['thumb', 'deba'], cuts: [cut('wash-scales', 'scaleSweep', side, 'thumb', 'scrape', 'mid', 8, window)],
    effects: [{ kind: 'water', ...line('scaleSweep', side), window }],
  });
}

export default { steps: [
  prep(['deba', 'tweezers'], '小さな出刃包丁、骨抜き、ペーパーと、水を張ったボウルを用意します。', { safety: keepCold }),
  rinseScales('L'), rinseScales('R'),
  step({
    id: 'head', title: '胸びれの後ろで切ります', summary: '蒲焼きや刺身にする魚は、胸びれのすぐ後ろで頭を落とします。',
    how: ['{L}手で頭を支え、胸びれの後ろに出刃包丁の刃元(はもと)を当てます。',
      '刃元をまな板へまっすぐ押し下げ、頭を分けます。'],
    tip: '細い胴を押しつぶさないよう、押さえる指は頭に寄せます。',
    mistake: '胴の方を強く握ると、柔らかい腹からわたが出てしまいます。',
    done: '頭が分かれ、首の断面に中骨が見えます。',
    pose: LB, place: headLeft, hands: [hand('opercleTop', '{L}手は頭に寄せて支えます。')],
    labels: [mark('pectoralBase', '胸鰭(むなびれ)')], camera: shot('closeup', line('headCut', 'L'), 1.25), durationMs: 5700,
    cuts: [cut('neck', 'headCut', 'L', 'deba', 'press', 'heel', 5, [0.29, 0.60], true)],
    moves: [move(k, 'head', [-7, 0, -4], [0.68, 0.95])],
  }),
  gut(k, { mistake: '細い腹に切っ先を深く入れると、わたを破ったり反対側の皮まで切ったりします。' }), wash(k),
  openEdge('R', 'ventralCut'),
  freeFillet(k, 'R', 'dorsalCut', false, {
    tip: 'ここでは腹と背を先に開きます。首から尾へ長く引いて取る大名(だいみょう)おろしもあります。',
    mistake: '中骨の上で小刻みに刃を往復させると、細長い身の切り口が波打ちます。',
  }),
  openEdge('L', 'dorsalCut'), freeFillet(k, 'L', 'ventralCut', false, {
    tip: '刃に骨の手応えが伝わらなくなったら、骨が見える切り口に戻します。',
    mistake: '胴を強く押さえると、細長い中骨がたわんで身に刃が入ります。',
  }),
  ribs(k, {
    summary: '頭寄りの薄い腹骨だけをすき、細い腹の身を残します。',
    tip: '骨が並ぶのは頭寄りのくぼみです。骨先が見える所で刃を止めます。',
    mistake: '尾までひと続きに腹の縁を落とすと、骨のない身まで取れてしまいます。',
  }),
  pinbones(k, { tip: '蒲焼きにする分は皮付きで取り分けます。皮があると、焼いて返すときに細い身が割れにくくなります。' }),
  peel(k, true, {
    title: '刺身用の薄皮をむきます', summary: '生食用で寄生虫対策を確認した片身は、頭側から尾へ薄皮をむきます。',
    done: '細長い身に銀色が残り、尾の端まで薄皮が離れています。',
  }),
] };
