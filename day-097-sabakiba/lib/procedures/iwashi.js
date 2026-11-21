// フライ用の手開き。背の皮と尾を残し、中骨を頭の方からめくる。
import { SPECIES_META } from '../species/meta.js';
import {
  LB, cut, dryFish, hand, hide, keepCold, line, mark, move, neckLeft, pinbones, practice, prep,
  scaleSide, shot, step, turn, wash,
} from './aji.js';

const k = SPECIES_META.iwashi.sizeCm.typical / 21;
const bellyUp = { head: 'L', dorsal: 'D' };
const openOnBoard = '頭側を{L}に、開いた身を上に置きます。';

function fingerWash(side) {
  const window = [0.30, 0.82];
  return scaleSide(side, {
    title: side === 'L' ? '指でうろこを払います' : '反対の面もすすぎます',
    summary: '水を張ったボウルで薄いうろこを払います。',
    how: ['{L}手で頭を支え、{R}手の指の腹を尾から頭へ軽く滑らせます。'],
    tip: '水に浮いた丸いうろこと、ひれの際に残ったうろこを見比べます。',
    mistake: '同じ場所を強くこすり続けると、薄い皮がむけて身が傷みます。',
    done: 'ひれの際からうろこが取れ、皮が破れずに残っています。',
    cuts: [cut('scales', 'scaleSweep', side, 'thumb', 'scrape', 'mid', 6, window)],
    effects: [{ kind: 'water', ...line('scaleSweep', side), window }],
  });
}

function trimRibs(side) {
  const first = side === 'R';
  return step({
    id: first ? 'ribs-first' : 'ribs-second', title: first ? '腹骨の帯を整えます' : '反対の腹骨を取ります',
    summary: first ? '手前の腹の縁に残った腹骨を、はさみで細い帯に切り取ります。' : '開いた身を板の上で半回転させ、もう一方の腹の縁を手前に寄せます。',
    how: ['背の方を軽く支え、はさみの先を腹骨の根元に沿わせます。頭寄りの骨が並ぶ所だけを細く切ります。'],
    tip: '骨先の位置を見ながら切ると、柔らかい腹の身を多く残せます。',
    mistake: '腹の縁を広く一直線に切ると、骨のない所まで落ちます。',
    done: '腹の縁に骨の帯が残らず、背の皮はつながっています。',
    pose: first ? bellyUp : { head: 'R', dorsal: 'D' },
    place: first ? openOnBoard : '頭側を{R}にして、開いた身を上に置きます。',
    hands: [hand('bodyCenter', '{L}手で背の身を支えます。', side + '.dorsal')],
    camera: shot('top', line('ribStrip', side), 1.12), durationMs: 5100,
    cuts: [cut('ribs', 'ribStrip', side, 'shears', 'press', 'tip', 7, [0.32, 0.72], true)],
    moves: [...(first ? [] : [turn('L.dorsal', 'x', 90, [0, 0.25], 'dorsalHinge'), turn('R.dorsal', 'x', -90, [0, 0.25], 'dorsalHinge')]),
      move(k, side + '.strip', [0.5, 0, 3.3], [0.76, 0.97])],
    labels: [mark('piece:' + side + '.strip', '腹骨(はらぼね)')],
  });
}

export default { steps: [
  prep(['thumb', 'shears', 'tweezers'], 'ボウル、ペーパー、骨抜き、キッチンばさみを手元にそろえます。', {
    how: ['手開きにはボウルとペーパー、仕上げには骨抜きとはさみを使います。',
      '手の水気を拭き、使わない包丁は刃を奥に向けて置きます。'],
    tip: '冷えた一尾ずつを出すと、手の熱がほかの魚に移りにくくなります。',
    mistake: '魚を何尾も手に握ったままにすると、手の熱で身が温まります。',
    done: '板が動かず、わたを入れる器と身を置く冷たい皿が手元にあります。', safety: keepCold,
  }),
  fingerWash('L'), fingerWash('R'),
  step({
    id: 'fold-head', title: '頭を腹の方へ折ります', summary: '胸びれの後ろで胴を支え、頭を折ってわたと一緒に引き出します。',
    how: ['頭を{R}にして背を上に向け、{L}手の親指と人さし指で胸びれの後ろを支えます。',
      '{R}手の親指を首の背側に当て、頭を腹へ曲げます。首が折れたら、頭をそっと引きます。'],
    tip: 'わたが途中で切れたら、残りは次に腹を開いたときに取れます。',
    mistake: '胴の真ん中を強く握ると、薄い腹が破れます。',
    done: '頭が外れ、首の腹側に親指を入れられる切り口が見えます。',
    place: '頭を{R}に、背を上にして両手で持ちます。', pose: { head: 'R', dorsal: 'U' },
    tools: ['thumb'], hands: [hand('headCutTop', '{L}手で胸びれの後ろを支えます。')],
    labels: [mark('pectoralBase', '胸鰭(むなびれ)')], camera: shot('side', 'headCutTop', 1.2), durationMs: 6000,
    highlight: [line('headCut', 'L')],
    moves: [turn('head', 'z', -38, [0.28, 0.53]), move(k, 'head', [6, 0, -3.2], [0.54, 0.88]),
      move(k, 'viscera', [3.8, 0, -1.7], [0.55, 0.83]), hide('viscera', [0.84, 0.97])],
  }),
  step({
    id: 'open-belly', title: '親指で腹を開きます', summary: '頭の切り口から腹の縁を割き、残ったわたを取ります。',
    how: ['{L}手を背に添えます。{R}手の親指を首の腹側に浅く入れ、肛門へ向けて縁を開きます。',
      '切り口から中をのぞき、残ったわたを指で取り除きます。'],
    tip: '指の腹を腹の縁に向けると、奥の柔らかい身を押さずに進めます。',
    mistake: '親指を背へ突き上げると、身が途中で割れます。',
    done: '腹の奥が見え、わたが残っていません。', pose: LB, place: neckLeft,
    hands: [hand('bodyCenter', '{L}手で背を支えます。', 'L.dorsal')], labels: [mark('vent', '肛門(こうもん)')],
    camera: shot('closeup', 'cavityStart', 1.22), durationMs: 5500,
    cuts: [cut('belly', 'bellySlit', null, 'thumb', 'push', 'tip', 5, [0.32, 0.79], false, true)],
    uniforms: { slitOpen: { to: 1, window: [0.35, 0.83] } },
  }),
  wash(k, false, { pose: LB, place: neckLeft, hands: [hand('cavityStart', '{L}手で腹の縁を広げます。', 'L.ventral')],
    how: ['腹に残った血を弱い流水で短くすすぎ、ペーパーで腹の中と皮の水気を拭きます。',
      '手とまな板を洗い、開き身を置く皿を用意します。'], safety: dryFish,
  }),
  step({
    id: 'finger-on-bone', title: '指を骨と身の間に入れます', summary: '背を手のひらに載せ、腹から親指の腹を入れて中骨の硬さを探ります。',
    how: ['腹を上に向け、頭の切り口で親指を中骨と身の境に当てます。骨に沿って腹の内側をそっとゆるめます。'],
    tip: '柔らかい身しか感じないときは、指を頭側の見えている骨へ戻します。',
    mistake: '力任せに指を押し込むと、身に穴が開きます。', done: '親指の腹に中骨が触れ、身の端を骨から浮かせられます。',
    place: '頭側を{L}に、背を手に載せて腹を上に向けます。', pose: bellyUp,
    hands: [hand('bodyCenter', '{L}の手のひらに背を載せます。', 'L.dorsal')], labels: [mark('spineHeadEnd', '中骨(なかぼね)')],
    camera: shot('closeup', 'spineHeadEnd', 1.24), durationMs: 5600,
    cuts: [cut('thumb', 'handOpen', 'R', 'thumb', 'push', 'tip', 5, [0.30, 0.81], true)],
    uniforms: { xray: { to: 0.36, window: [0.26, 0.40] } }, practice: practice('thumb', 0.42),
  }),
  step({
    id: 'trace-spine', title: '親指で尾までたどります', summary: '親指を骨に沿わせて頭側から尾へ滑らせ、両側の身をゆるめます。',
    how: ['硬い中骨を指の腹に感じたまま、首側から尾の付け根まで親指を送ります。反対の面も骨際をゆるめます。'],
    tip: '背を受ける手を指の進みに合わせて添えると、身をつぶさずに骨をたどれます。',
    mistake: '背の皮を越えるまで押し込むと、開きが二枚に分かれます。',
    done: '尾の付け根まで身がゆるみ、背の皮で両側がつながっています。',
    place: '腹を上に、頭側を{L}にして背を支えます。', pose: bellyUp,
    hands: [hand('bodyCenter', '{L}手は背を下から受けます。', 'L.dorsal')], camera: shot('cook', 'bodyCenter', 1.1), durationMs: 6800,
    cuts: [cut('follow-r', 'boneCut', 'R', 'thumb', 'push', 'tip', 5, [0.17, 0.44], true),
      cut('follow-l', 'boneCut', 'L', 'thumb', 'push', 'tip', 5, [0.57, 0.86], true)],
  }),
  step({
    id: 'unfold', title: '背の皮を残して広げます', summary: '背の皮をつなぎ目にして両側の身を開き、内側を上にして置きます。',
    how: ['背の皮を手で受けたまま、腹の両縁を外に開きます。身を板へ下ろします。'],
    tip: '骨と身の間に親指が通った所から広げると、背の皮を残せます。',
    mistake: '骨に身が付いたまま両端を引くと、薄い背の皮が裂けます。',
    done: '身の内側が一面に見え、中央に中骨が残っています。', place: openOnBoard, pose: bellyUp,
    tools: ['thumb'], hands: [hand('bodyCenter', '{L}手で広がる身を受けます。', 'L.dorsal')],
    camera: shot('top', 'bodyCenter', 1.05), durationMs: 4700,
    moves: [turn('L.dorsal', 'x', -90, [0.19, 0.85], 'dorsalHinge'), turn('R.dorsal', 'x', 90, [0.19, 0.85], 'dorsalHinge')],
    uniforms: { xray: { to: 0, window: [0.1, 0.4] } },
  }),
  step({
    id: 'lift-bone', title: '頭側から中骨をめくります', summary: '身を支えながら、中骨を頭側から尾へ少しずつめくります。',
    how: ['{L}指を骨際の身に添え、{R}手で首側の中骨をつまみます。尾に向かって骨を低く起こします。'],
    tip: '身が持ち上がる所へ押さえる指を移すと、長い小骨が中骨についてきます。',
    mistake: '骨だけを一気に持ち上げると、柔らかい身もはがれます。',
    done: '中骨が尾の付け根を残して身から浮いています。', place: openOnBoard, pose: bellyUp,
    hands: [hand('bodyCenter', '{L}手で骨の脇の身を支えます。', 'L.dorsal')],
    camera: shot('cook', line('boneLift'), 1.12), durationMs: 6000,
    cuts: [cut('lift', 'boneLift', null, 'thumb', 'peel', 'tip', 8, [0.18, 0.74], true)],
    moves: [move(k, 'bone', [0, 0.9, 0], [0.37, 0.80]), turn('bone', 'z', -8, [0.37, 0.80])],
  }),
  step({
    id: 'break-tail', title: '尾の根元で骨を折ります', summary: '尾びれを身に残し、持ち上げた中骨だけを折って外します。',
    how: ['{L}手で尾に近い身を支えます。{R}手で中骨の尾の付け根を折り、外れた骨を脇へ置きます。'],
    tip: 'フライにする開きには、つまんで持てる尾びれを残せます。',
    mistake: '骨を尾の先まで引きちぎると、尾びれまで取れてしまいます。',
    done: '開き身に尾びれが残り、中骨が一本で外れています。', place: openOnBoard, pose: bellyUp,
    tools: ['thumb'], hands: [hand('peduncle', '{L}手で尾の身を支えます。', 'R.dorsal')],
    labels: [mark('peduncle', '尾の付け根', 'R.dorsal')], camera: shot('closeup', 'peduncle', 1.18), durationMs: 4600,
    moves: [move(k, 'bone', [1.6, 0.2, -6.5], [0.34, 0.89]), turn('bone', 'z', 0, [0.34, 0.89])],
  }),
  trimRibs('R'), trimRibs('L'),
  pinbones(k, {
    pose: { head: 'R', dorsal: 'D' }, place: '開いた身を上に、頭側を{R}に置きます。',
    summary: '身の中央と腹をなで、中骨から離れて身に残った小骨を抜きます。',
    tip: '骨が倒れている向きを指で確かめ、その向きへ低く引きます。',
    done: '身も腹の縁も指に骨先が触れず、尾と背の皮がつながったフライ用の開きになっています。',
    moves: ['R', 'L'].map((side, i) => move(k, 'pinbones.' + side, [1.5, 0.9, 0],
      i === 0 ? [0.46, 0.60] : [0.82, 0.98], { opacity: 0, visible: false })),
  }),
] };
