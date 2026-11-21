// 有眼側は魚自身の L。画面を鏡映しても黒い側・白い側の呼び名は入れ替えない。
import {
  LB, LF, RB, RF, cut, hand, headSide, hide, line, mark, move, peel, pinbones, practice, moveScale, prep, ribs,
  scaleSide, shot, step, turn,
} from './aji.js';

const k = moveScale('hirame');
const blackUp = '黒い面を上に、頭側を{L}、腹を手前に置きます。';
const whiteUp = '白い面を上に、頭側を{R}、腹を手前に置きます。';
const freezing = 'クドア対策は−20℃で4時間以上冷凍します。アニサキス対策は−20℃以下で魚全体が完全に凍ってから24時間以上です。';

function centerCut(side) {
  const black = side === 'L';
  return step({
    id: black ? 'center-black' : 'center-white', title: black ? '黒い面の中央を切ります' : '返して白い面を切ります',
    summary: black ? 'ひれ際に浅い切れ目を入れ、黒い面の中央から中骨を探ります。'
      : '黒い面の身を脇に置いて白い面を上に返し、ひれの際と中央に切れ目を入れます。',
    how: ['背びれと尻びれのすぐ内側を、切っ先で浅く引きます。',
      '頭側の切り口から尾の付け根へ、身の中央をまっすぐ切ります。刃に骨が触れた所で止めます。'],
    tip: black ? '皮の切れ目をひれの根元に寄せると、えんがわがひれ側に取り残されにくくなります。'
      : '白い方も、首の切り口に見える中骨を目印に刃を入れます。',
    mistake: black ? 'ひれから離れて内側を切ると、縁に沿ったえんがわまで失います。'
      : '白い面の薄い身に切っ先を深く立てると、身を突き抜けます。',
    done: 'ひれに沿って皮が開き、中央の切れ目から中骨に触れます。',
    place: black ? blackUp : whiteUp, pose: black ? LB : RB,
    hands: [hand('headCutBottom', '{L}手を中央線からずらして身を支えます。', side + '.ventral')],
    labels: [mark('bodyCenter', black ? '有眼側(ゆうがんそく)' : '無眼側(むがんそく)', side + '.dorsal')],
    camera: shot('top', line('lateralSplit', side), 1.05), durationMs: 8200,
    cuts: [cut('dorsal-rim', 'dorsalCut', side, 'deba', 'pull', 'tip', 12, [0.28, 0.41]),
      cut('ventral-rim', 'ventralCut', side, 'deba', 'pull', 'tip', 12, [0.45, 0.58]),
      cut('center', 'lateralSplit', side, 'deba', 'pull', 'mid', 10, [0.64, 0.87], true)],
    uniforms: { xray: { to: 0.35, window: [0.58, 0.70] } }, practice: practice('center', 0.48),
  });
}

function bellyQuarter(side) {
  const black = side === 'L';
  return step({
    id: black ? 'black-belly' : 'white-belly', title: black ? '黒い面の腹身を外します' : '白い面の腹身を外します',
    summary: '中央の切れ目から尻びれの方へ、骨の表面に沿って腹の身を外します。',
    how: ['中央に刃を寝かせ、すでに浮いた身の端を支えます。切っ先を小さく引くたびに、尻びれの方へ切り幅を広げます。',
      '頭に近い所は腹骨の付け根を外し、ひれ際の切れ目につなげて腹身を手前に置きます。'],
    tip: '先に離れた身を少しだけ浮かせると、次に切る骨と身の境が見えます。',
    mistake: 'まだ骨につながった身を引っぱると、薄い腹の身が裂けます。',
    done: '腹側の骨が平らに見え、腹の身が一枚で外れています。',
    pose: black ? LB : RB, place: black ? blackUp : whiteUp,
    hands: [hand('headCutBottom', '{L}指で腹身の浮いた端を支えます。', side + '.ventral')],
    labels: [mark('piece:' + side + '.ventral', '腹身(はらみ)')], camera: shot('top', line('ventralCut', side), 1.07), durationMs: 7000,
    cuts: [cut('bone', 'boneCut', side, 'deba', 'slice', 'tip', 5, [0.24, 0.50], true),
      cut('rim', 'ventralCut', side, 'deba', 'pull', 'tip', 7, [0.56, 0.71], true)],
    moves: [move(k, side + '.ventral', [black ? -4.5 : 4.5, 0.25, 4.7], [0.74, 0.97])],
  });
}

function backQuarter(side) {
  const black = side === 'L', x = black ? -4.5 : 4.5;
  // 板の上で半回転し、先に取った腹身を奥へ。背身を持ち上げる間は親の変位を差し引き、腹身をその場に置く。
  const release = [0.74, 0.98];
  return step({
    id: black ? 'black-back' : 'white-back', title: black ? '黒い面の背身を外します' : '白い面の背身を外します',
    summary: '同じ面を上にして半回転させ、背びれを手前にして背の身を取ります。',
    how: ['先に外した腹身を奥へ置き、中央から刃を骨に寝かせます。',
      '背びれに向けて切っ先で浅く引き重ねます。ひれ際の皮の切れ目まで届いたら、背身を手前に離します。'],
    tip: '骨の表面を見ながら切り幅を少しずつ広げると、ひれ際まで身を残せます。',
    mistake: '刃が上を向くと、骨の上に厚く身が残ります。',
    done: black ? '黒い面から腹身と背身の二枚が取れています。' : '黒と白の面から二枚ずつの身が取れ、中央に骨が一枚残っています。',
    pose: black ? RF : LF,
    place: black ? '黒い面を上に、頭側を{R}、背を手前に置きます。' : '白い面を上に、頭側を{L}、背を手前に置きます。',
    hands: [hand('headCutTop', '{L}指で背身の浮いた端を支えます。', side + '.dorsal')],
    labels: [mark('piece:' + side + '.dorsal', '背身(せみ)')], camera: shot('top', line('dorsalCut', side), 1.07), durationMs: 7000,
    cuts: [cut('bone', 'boneCut', side, 'deba', 'slice', 'tip', 5, [0.30, 0.51], true),
      cut('rim', 'dorsalCut', side, 'deba', 'pull', 'tip', 7, [0.56, 0.70], true)],
    moves: [move(k, side + '.ventral', [x, 0.25, -4.7], [0, 0.25]),
      move(k, side + '.dorsal', [x, 0.25, 4.7], release), move(k, side + '.ventral', [0, 0, -9.4], release)],
  });
}

// 背びれは頭の上から始まります。外した背身には、首の切り口から後ろの縁だけが残ります。
export default { curveLimits: { engawaCut: ['headCutTop', 'dorsalFinEnd'] }, steps: [
  prep(['deba', 'scaler', 'tweezers', 'yanagi'], '出刃包丁、うろこ用の目の細かいたわし、骨抜き、ペーパーを用意します。', {
    title: '板を整え黒い面を上にします', place: blackUp,
    summary: 'まな板の下に固く絞ったぬれ布巾を敷き、両目が見える黒い面を上に置きます。',
    how: ['出刃包丁、うろこ用のたわし、骨抜き、ペーパーをそろえます。手と柄の水気を拭き、置く刃は奥へ向けます。',
      '両目が並ぶ黒い面が有眼側(ゆうがんそく)、反対の白い面が無眼側(むがんそく)です。',
      freezing],
    tip: '頭の外から支えます。歯のある口には指を入れません。',
    mistake: '口に指を掛けると、鋭い歯で指を傷つけます。',
    done: 'まな板がずれず、黒い面の両目と手前の腹が見えます。',
    labels: [mark('eye', '有眼側(ゆうがんそく)')],
    safety: 'クドアは目で見分けられません。加熱は中心75℃で5分以上です。刺身は生食用の表示か両方の冷凍条件を確かめた身に限ります。',
  }),
  scaleSide('L', {
    summary: '黒い面を目の細かいたわしで尾から頭へこすり、うろことぬめりを落とします。',
    how: ['口から離して頭を支え、目の細かいたわしを尾から頭へ滑らせます。ひれの際のざらつきも落とします。'],
    tip: '腹の縁までたわしを当てると、細かなうろことぬめりを一緒に落とせます。',
  }),
  scaleSide('R', { pose: RB, place: whiteUp,
    how: ['白い面に返し、口を避けて頭を押さえます。たわしで尾から頭へこすり、ぬめりを洗い流します。'],
  }),
  headSide(k, 'R', false, {
    pose: RB, place: whiteUp, hands: [hand('bodyCenter', '{L}手は口から離し、胴を支えます。')],
    how: ['えらぶたの後ろから胸びれの根元を回り、腹びれが頭側に付く線を切っ先（刃の先端）で浅くなぞります。',
      'その筋に刃の中ほどを戻し、首の継ぎ目まで引きます。'],
  }),
  headSide(k, 'L', true, {
    pose: RF, place: '黒い面を上に、頭を{R}、背を手前に置きます。',
    hands: [hand('bodyCenter', '{L}手は切り口から離し、胴を支えます。')],
    moves: [move(k, 'head', [6.5, 0, -5.5], [0.74, 0.96])],
  }),
  step({
    id: 'clean-cavity', title: '頭寄りのわたを取ります', summary: '首のすぐ後ろの小さな腹からわたを出し、中骨の下に残った血を洗います。',
    how: ['白い面を上にし、頭の切り口から内臓を受け皿へ移します。',
      '中骨の下を流水で洗い、ペーパーで腹と皮の水を拭きます。手、包丁、まな板も洗います。'],
    tip: 'わたのある場所は尻びれの始まりに近い、頭のすぐ後ろです。',
    mistake: '尾まで腹を開くと、わたの入っていない身にまで切り込みが入ります。',
    done: '首の切り口から見える腹の中に、わたや血の塊が残っていません。',
    place: whiteUp, pose: RB, tools: ['thumb'], hands: [hand('headCutBottom', '{L}手で首の切り口を支えます。', 'R.ventral')],
    labels: [mark('cavityStart', '腹腔(ふくくう)')], camera: shot('closeup', 'cavityStart', 1.28), durationMs: 7000,
    highlight: [line('kidneyLine')], effects: [{ kind: 'water', ...line('kidneyLine'), window: [0.65, 0.9] }],
    moves: [move(k, 'viscera', [3.5, 0.5, 0.7], [0.27, 0.47]), hide('viscera', [0.49, 0.63]),
      move(k, 'kidney', [1.6, 0.2, 0.4], [0.68, 0.89], { opacity: 0, visible: false })],
  }),
  centerCut('L'), bellyQuarter('L'), backQuarter('L'), centerCut('R'), bellyQuarter('R'), backQuarter('R'),
  ribs(k, {
    summary: '頭側に腹骨が付いている二枚の腹身を、皮を下にして置き直します。',
    how: ['腹身を一枚ずつ板に置き、腹骨の根元に切っ先を当てます。',
      '刃を寝かせて骨の曲面に沿って腹の縁へ引き、薄い膜と一緒に骨を外します。'],
    tip: '腹骨のある頭側を手元に寄せると、骨の丸みに刃を合わせやすくなります。',
    place: '皮を下にし、頭側を手元に置きます。',
    hands: ['R', 'L'].map(side => hand('headCutBottom', '{L}手で腹の身を支えます。', side + '.ventral')),
    moves: [turn('L.dorsal', 'z', 180, [0, 0.24]), move(k, 'L.dorsal', [-3.5, 0.25, 4], [0, 0.24]),
      move(k, 'R.dorsal', [3.5, 0.25, -4], [0, 0.24]), move(k, 'L.ventral', [0, 0, 0.15], [0, 0.24]),
      move(k, 'R.ventral', [0, 0, 0.15], [0, 0.24]),
      move(k, 'R.strip', [2, 0, 3], [0.49, 0.60]), move(k, 'R.ventral', [0, 0, 2.7], [0.61, 0.78]),
      move(k, 'R.strip', [2, 0, 0.45], [0.61, 0.78]), move(k, 'L.strip', [-2, 0, 3], [0.85, 0.91]),
      move(k, 'L.ventral', [0, 0, 2.7], [0.92, 1]), move(k, 'L.strip', [-2, 0, 0.45], [0.92, 1])],
  }),
  pinbones(k, {
    summary: '背と腹を分けた切り口を指でたどり、残った骨先を探します。',
    how: ['骨先が触れたら根元の身を支え、骨抜きでつまみます。骨の倒れている方へ浅く引いて、四枚を確かめます。'],
  }),
  step({
    id: 'engawa', title: 'えんがわを帯で外します', summary: '筋目が変わる所に沿って、ひれを動かす細長い筋肉、縁側(えんがわ)を外します。',
    how: ['背びれ際の筋目の境に切っ先を入れ、縁に沿って浅く引きます。細長い身を帯のまま外します。',
      '尻びれ側の身にも同じ筋目の境があります。白い面から取った身も順に確かめます。'],
    tip: '皮を引く前なら、ひれの際に続く細い帯を見つけやすくなります。',
    mistake: '筋目の境から内側へ入りすぎると、えんがわに普通の身が厚く付きます。',
    done: 'ひれ際にあった筋肉が細い帯で分かれています。', place: '四枚の身を皮が下になるよう並べます。', pose: LB,
    hands: ['L', 'R'].map(side => hand('bodyCenter', '{L}手で縁の内側の身を支えます。', side + '.dorsal')),
    labels: ['L', 'R'].flatMap(side => [mark('dorsalFinStart', '縁側(えんがわ)', side + '.dorsal'), mark('analFinStart', '縁側(えんがわ)', side + '.ventral')]),
    camera: shot('top', line('engawaCut', 'L'), 1.03), durationMs: 7000,
    cuts: [cut('edge-l', 'engawaCut', 'L', 'deba', 'pull', 'tip', 7, [0.20, 0.45]),
      cut('edge-r', 'engawaCut', 'R', 'deba', 'pull', 'tip', 7, [0.58, 0.84])],
  }),
  peel(k, false, {
    summary: '四枚の身とえんがわを皮が下になるように置き、尾側から皮を引きます。',
    tip: '身とえんがわは一枚ずつ皮を引きます。刺身には生食用の表示がある身か、両方の冷凍条件を満たした身だけを使います。',
    safety: freezing,
    done: '四枚の身とえんがわから皮が外れ、中骨を脇に分けてあります。',
  }),
] };
