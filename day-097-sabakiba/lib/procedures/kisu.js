// 天ぷら用の背開き。首からわたを出すので、腹の皮に切り線を付けない。
import {
  RF, cut, dryFish, hand, hide, line, mark, move, neckRightBack, pinbones, practice, moveScale, prep, scaleSide, shot, step, turn, wash,
} from './aji.js';

const k = moveScale('kisu', 'depth');
const fleshUp = { head: 'R', dorsal: 'U' }, skinUp = { head: 'R', dorsal: 'D' };

function fineScales(side) {
  return scaleSide(side, {
    title: side === 'L' ? '細かいうろこを払います' : '裏と腹のうろこを取ります',
    summary: '小さな包丁を皮に軽く立てて、ひれの際までうろこを払います。',
    how: ['{L}手をえらぶたの外に当て、ペティナイフの先寄りで尾から頭へ短くこすります。'],
    tip: '細い腹にも小さなうろこが残るので、腹の縁まで見ます。',
    mistake: '刃で強くこすると、薄い皮の下の身まで傷みます。',
    cuts: [cut('scales', 'scaleSweep', side, 'petty', 'scrape', 'tip', 20, [0.30, 0.84])],
  });
}

function ribEdge(side) {
  const first = side === 'L', window = [0, 0.25];
  const angle = first ? -90 : 90;
  return step({
    id: first ? 'ribs-first' : 'ribs-second', title: first ? '腹骨を薄くすきます' : 'もう片側の腹骨をすきます',
    summary: first ? '開いて皮を下にし、頭寄りに並ぶ腹骨の根元を見つけます。'
      : '身を板の上で回し、反対の腹骨にも腹の縁へ向かって刃を通します。',
    how: ['{L}手で身を支え、切っ先で弓なりの骨の根元を浮かせます。',
      '刃の中ほどを骨に寝かせ、腹の縁へ薄く引きます。つなぎ目の皮に届く前に刃を浮かせます。'],
    tip: '刃の上に骨と薄い膜だけが乗るように、くぼみの丸みをたどります。',
    mistake: '刃先を深く下へ向けると、開いた身をつなぐ皮を切ってしまいます。',
    done: '腹に浅い刃跡が残り、骨の列が薄く外れています。',
    place: first ? '皮を下に、頭の切り口を手前に向けます。' : '皮を下にしたまま、頭側を奥へ回します。',
    pose: { head: first ? 'F' : 'B', dorsal: 'U' },
    hands: [hand('bodyCenter', '{L}手を骨の列からずらして支えます。', side + '.dorsal')],
    labels: [mark('piece:' + side + '.strip', '腹骨(はらぼね)')], camera: shot('top', line('ribStrip', side), 1.1), durationMs: 5900,
    cuts: [cut('ribs', 'ribStrip', side, 'petty', 'slice', 'mid', 6, [0.32, 0.73], true)],
    moves: [turn('L.dorsal', 'z', angle, window, 'ventralHinge'), turn('R.dorsal', 'z', -angle, window, 'ventralHinge'),
      move(k, side + '.strip', [3.1, 0.15, 0.7], [0.77, 0.97])],
  });
}

export default { steps: [
  prep(['petty', 'tweezers'], '小ぶりのペティナイフ、骨抜き、ペーパーをそろえます。', {
    tip: '細い身の上でも、手の力で刃を止められる小ぶりの包丁が扱いやすいです。',
    mistake: '重い出刃包丁を使うと、背から開くときに重みで腹の皮まで切りやすくなります。',
  }),
  fineScales('L'), fineScales('R'),
  step({
    id: 'head', title: 'ひれの後ろで頭を落とします', summary: '胸びれと腹びれのすぐ後ろを結ぶ線に、斜めに刃を当てます。',
    how: ['頭を{R}にし、{L}手で胴を支えます。小ぶりの包丁の中ほどを胸びれの後ろに当てます。',
      '腹びれのすぐ後ろへ向けて斜めに切り下ろし、頭を外します。'],
    tip: '切る前に二つのひれの付け根を見ると、頭側に残す位置を決めやすくなります。',
    mistake: '胸びれから離れた所を横に切ると、胴の身まで頭に付きます。',
    done: '頭が離れ、首の切り口から腹の中が見えます。',
    place: '頭を{R}に、背を手前に置きます。', pose: RF,
    hands: [hand('bodyCenter', '{L}手で胴を支えます。', 'L.dorsal')], labels: [mark('pelvicBase', '腹鰭(はらびれ)')],
    camera: shot('closeup', line('headCut', 'L'), 1.24), durationMs: 5600,
    cuts: [cut('neck', 'headCut', 'L', 'petty', 'press', 'mid', 15, [0.32, 0.62], true)],
    moves: [move(k, 'head', [6.5, 0, -4], [0.69, 0.95])],
  }),
  step({
    id: 'gut-at-neck', title: '首からわたを出します', summary: '頭を落とした切り口からわたを取り出し、腹の縁の皮を残します。',
    how: ['包丁を置きます。{L}手で背を支え、首の切り口からわたを受け皿に移します。'],
    tip: '天ぷらで一尾の形を保つつなぎ目は、腹側に残す皮です。',
    mistake: 'ここで肛門まで腹を切り開くと、背から開いたときに身が二つに分かれます。',
    done: 'わたが外れ、腹の縁には切れ目が入っていません。', place: neckRightBack, pose: RF, tools: ['thumb'],
    hands: [hand('bodyCenter', '{L}手で背側を支えます。', 'L.dorsal')], labels: [mark('cavityStart', '腹の入り口')],
    camera: shot('closeup', 'cavityStart', 1.27), durationMs: 4300,
    moves: [move(k, 'viscera', [3.1, 0.5, 0], [0.23, 0.69]), hide('viscera', [0.70, 0.96])],
  }),
  wash(k, false, { pose: RF, place: neckRightBack, hands: [hand('headCutBottom', '{L}手で首の切り口を支えます。', 'L.ventral')],
    summary: '首の切り口から水を通し、中骨の下に残った血を洗い流します。',
    how: ['首の切り口から、中骨の下に残った血を水道水で洗い流します。',
      '腹の中と皮から水気を拭き取り、手と包丁とまな板を洗います。'],
    tip: '切り口を少し広げると、皮を切り足さずに腹の中をのぞけます。',
  }),
  step({
    id: 'open-back', title: '背の際から刃を入れます', summary: '背びれの際から中骨の上を通し、腹の皮を残して切り開きます。',
    how: ['首の背側から背びれに沿って、切っ先（刃の先端）を頭側から尾へ浅く引きます。',
      '刃を寝かせて同じ筋に戻し、中骨を越えて腹側の身まで開きます。尾の付け根の手前で引くのを止めます。'],
    tip: '最初に切った筋へ刃を戻すと、細い魚でも背骨の上をたどれます。',
    mistake: '刃を立てたまま深く押すと、腹の皮を突き抜けます。',
    done: '背の切り口から中骨が見え、腹の皮と尾がつながっています。',
    pose: RF, place: neckRightBack, hands: [hand('headCutBottom', '{L}手で腹寄りの身を軽く支えます。', 'L.ventral')],
    labels: [mark('dorsalFinStart', '背鰭(せびれ)')], camera: shot('cook', line('dorsalOpen'), 1.2), durationMs: 6500,
    cuts: [cut('back', 'dorsalOpen', null, 'petty', 'pull', 'tip', 12, [0.24, 0.55]),
      cut('along-bone', 'boneCut', 'L', 'petty', 'slice', 'mid', 6, [0.63, 0.85], true)],
    practice: practice('back', 0.35),
  }),
  step({
    id: 'unfold', title: '腹の皮を残して開きます', summary: '背の切り口を両側に広げ、つながった腹の皮を下に置きます。',
    how: ['包丁を置いて、背の切り口に指を添えます。腹の皮でつながった両側の身を本を開くように広げます。'],
    tip: '背側から中骨に沿って刃が通っていれば、身を強く引かずに開けます。',
    mistake: '切れていない所を引っ張ると、薄い腹の皮が裂けます。',
    done: '両側が平らに開き、骨の位置と腹のつなぎ目が見えます。',
    place: '頭側を{R}に、開いた身を上に置きます。', pose: fleshUp, tools: ['thumb'],
    hands: [hand('bodyCenter', '{L}手で開き身を支えます。', 'L.dorsal')],
    labels: [mark('spineHeadEnd', '中骨(なかぼね)')], camera: shot('top', 'bodyCenter', 1.08), durationMs: 4700,
    moves: [turn('L.dorsal', 'x', -90, [0.28, 0.87], 'ventralHinge'), turn('R.dorsal', 'x', 90, [0.28, 0.87], 'ventralHinge')],
  }),
  step({
    id: 'free-spine', title: '中骨に沿って切ります', summary: '開いた身を伏せ、首側から中骨と身の間を切り進めます。',
    how: ['皮を上にして、見えている首の切り口で中骨の位置を確かめます。',
      '刃の中ほどを骨に寝かせ、首から尾へ引きます。尾の付け根まで来たら止めます。'],
    tip: '押さえる指を中骨の線から外しておくと、刃の通る所を空けられます。',
    mistake: '尾の先まで引き切ると、天ぷら用に残す尾びれが外れます。',
    done: '骨と身の間が開き、骨は尾の付け根だけでつながっています。',
    place: '開き身を伏せ、皮を上、頭側を{R}に置きます。', pose: skinUp,
    hands: [hand('headCutTop', '{L}指を骨の線から離して支えます。', 'R.dorsal')],
    camera: shot('top', line('boneLift'), 1.1), durationMs: 5600,
    cuts: [cut('bone', 'boneLift', null, 'petty', 'pull', 'mid', 6, [0.30, 0.82], true)],
    uniforms: { xray: { to: 0.36, window: [0.25, 0.38] } },
  }),
  step({
    id: 'cut-tail-joint', title: '尾を残して中骨を外します', summary: '尾びれの付け根で中骨だけを切り、開き身から骨を取り外します。',
    how: ['尾の付け根に包丁の先を寄せます。つながった骨だけを押し切り、包丁を置いて中骨を脇へ移します。'],
    tip: '尾の皮のつながりを見てから骨を断つと、尾びれを身に残せます。',
    mistake: '尾を丸ごと横に切り落とすと、衣を付けるときにつまむ所も取れてしまいます。',
    done: '尾びれが付いたまま、開き身から中骨が離れています。',
    place: '皮を上、尾を{L}に向けます。', pose: skinUp,
    hands: [hand('bodyCenter', '{L}手は刃の当たる尾から離します。', 'L.dorsal')],
    labels: [mark('peduncle', '尾の付け根', 'L.dorsal')], camera: shot('closeup', 'peduncle', 1.2), durationMs: 4800,
    cuts: [cut('joint', 'tailCut', 'L', 'petty', 'press', 'tip', 8, [0.22, 0.54], true)],
    moves: [move(k, 'bone', [0.8, 0.2, -6.2], [0.63, 0.95])], uniforms: { xray: { to: 0, window: [0.65, 0.92] } },
  }),
  ribEdge('L'), ribEdge('R'),
  pinbones(k, {
    pose: { head: 'B', dorsal: 'U' }, place: '開いた身を上に、頭の切り口を奥へ向けます。',
    how: ['腹と身の中央をなで、触れた小骨の脇を{L}指で支えます。骨抜きを骨の傾きに合わせて引きます。',
      '揚げる前にペーパーで両面と尾びれの水気をよく拭きます。'],
    done: '骨先が指に当たらず、天ぷら用に尾びれと腹の皮で身がつながっています。',
    moves: [move(k, 'pinbones.R', [0, 0.9, -1.4], [0.46, 0.60], { opacity: 0, visible: false }),
      move(k, 'pinbones.L', [0, 0.9, -1.4], [0.82, 0.98], { opacity: 0, visible: false })],
    safety: dryFish,
  }),
] };
