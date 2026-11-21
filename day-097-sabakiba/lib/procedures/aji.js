// アジを基準にした盤上の変位。刃の角度は実測値ではなく、立てる・寝かせる動きを示す作画値。
import { SPECIES_META } from '../species/meta.js';
import safety from '../content/safety.js';

const k = SPECIES_META.aji.sizeCm.typical / 21;
export const [keepCold, washHands, , clearBlade, scuteWarning, , rinseBlood, dryFish, sashimiKnife] = safety.stepNotes;

export const LB = { head: 'L', dorsal: 'B' }, LF = { head: 'L', dorsal: 'F' };
export const RB = { head: 'R', dorsal: 'B' }, RF = { head: 'R', dorsal: 'F' };
export const headLeft = '頭を{L}に、腹を手前に置きます。';
export const headLeftBack = '頭を{L}に、背を手前に置きます。';
export const neckRight = '頭の切り口を{R}に、腹を手前に置きます。';
export const neckLeft = '頭の切り口を{L}に、腹を手前に置きます。';
export const neckRightBack = '頭の切り口を{R}に、背を手前に置きます。';
export const neckLeftBack = '頭の切り口を{L}に、背を手前に置きます。';

export const line = (curve, side = null) => ({ curve, side });
export const shot = (preset, focus, zoom = 1) => ({ preset, focus, zoom });
export const mark = (anchor, text, piece) => ({ anchor, text, ...(piece && { piece }) });
export const hand = (anchor, text, piece) => ({ ...mark(anchor, text, piece), who: 'off' });
export const practice = (cut, tolerance = 0.5) => ({ cut, tolerance });
export const cut = (id, curve, side, tool, motion, lead, angleDeg, window, through = false, reverse = false) =>
  ({ id, curve, side, tool, motion, lead, angleDeg, window, through, reverse });
export const move = (k, piece, distance, window, extra = {}) =>
  ({ piece, move: distance.map(cm => cm * k), window, ...extra });
export const turn = (piece, axis, deg, window, about = 'pivot') => ({ piece, rot: { axis, deg, about }, window });
export const hide = (piece, window) => ({ piece, window, opacity: 0, visible: false });

// 道具札・光る線・練習の対象を、実際に再生する切りから作る。
export function step(data) {
  const cuts = data.cuts ?? [];
  return {
    tools: [...new Set(cuts.map(c => c.tool))],
    highlight: cuts.map(c => line(c.curve, c.side)),
    ...(cuts.length ? { practice: practice(cuts[0].id) } : {}),
    ...data,
  };
}

export function prep(tools, equipment, changes = {}) {
  return step({
    id: 'prep', title: '板と道具を整えます', summary: 'ぬれ布巾を固く絞ってまな板の下に敷き、板が動かないか確かめます。',
    how: [equipment, '手と柄の水気を拭き、包丁を置くときは刃を奥へ向けます。'],
    tip: 'わたを受ける器と、身を置く冷たい皿を先に分けておきます。',
    mistake: '手や柄がぬれたままだと、包丁を握った手が滑ります。',
    done: '板に手を添えてもずれず、柄を乾いた手で握れます。',
    place: headLeft, pose: LB, tools, hands: [hand('bodyCenter', '{L}手で胴が滑らないか確かめます。')],
    camera: shot('cook', 'bodyCenter'), durationMs: 3500, ...changes,
  });
}

export function scaleSide(side, changes = {}) {
  const first = side === 'L', window = [0.30, 0.84];
  return step({
    id: first ? 'scales-left' : 'scales-right', title: first ? 'うろこを落とします' : '裏のうろこを取ります',
    summary: first ? '尾から頭へうろこ取りを動かし、皮の表面を整えます。' : '魚を裏返し、反対の面も尾から頭へこすります。',
    how: ['{L}手で頭を支え、うろこ取りを尾の付け根から頭へ短く動かします。'],
    tip: '胸びれの陰と腹の縁も見ます。', mistake: 'ひれのまわりを飛ばすと、付け根にうろこが残ります。',
    done: 'ひれの際まで、浮いたうろこが見当たりません。',
    place: first ? headLeft : headLeftBack, pose: first ? LB : LF,
    hands: [hand('opercleTop', '{L}手でえらぶたの外を支えます。')],
    camera: shot('cook', line('scaleSweep', side), 1.12), durationMs: 5100,
    cuts: [cut('scales', 'scaleSweep', side, 'scaler', 'scrape', 'mid', 16, window)],
    uniforms: { scale: { to: first ? 0.5 : 0, window } },
    effects: [{ kind: 'scales', ...line('scaleSweep', side), window }],
    ...changes,
  });
}

function scutes(side) {
  const first = side === 'L', scales = [0.28, 0.46], row = [0.58, 0.87];
  return scaleSide(side, {
    title: first ? 'うろことぜいごを取ります' : '裏のぜいごもそぎます',
    summary: first ? '普通のうろこを払ってから、尾に並ぶ硬いうろこ「ぜいご」を薄くそぎます。'
      : '頭の位置を保って裏返し、もう一方の面に残ったうろことぜいごを取ります。',
    how: ['ペーパー越しに{L}手で頭を支え、うろこ取りを尾から頭へ軽く動かします。',
      '出刃包丁の先をぜいごの下に入れ、刃を寝かせます。小さく前後させながら頭へ進めます。'],
    tip: '尾の付け根で硬い列の端を見つけると、身を削らずに刃を入れられます。',
    mistake: '硬さにつられて刃を立てると、ぜいごの下に深い溝ができます。',
    done: '尾に沿った硬い列が取れ、その下に身が残っています。',
    camera: shot('closeup', line('scuteRow', side), 1.22), durationMs: 7300,
    cuts: [cut('scales', 'scaleSweep', side, 'scaler', 'scrape', 'mid', 16, scales),
      cut('scutes', 'scuteRow', side, 'deba', 'scrape', 'tip', 8, row)],
    uniforms: { scale: { to: first ? 0.5 : 0, window: scales }, scutes: { to: first ? 0.5 : 0, window: row } },
    effects: [{ kind: 'scales', ...line('scaleSweep', side), window: scales }],
    labels: [mark('peduncle', 'ぜいご')], practice: practice('scutes', 0.42), safety: scuteWarning,
  });
}

export function headSide(k, side, last, changes = {}) {
  return step({
    id: last ? 'head-second' : 'head-first', title: last ? '反対から頭を外します' : '胸びれの後ろを切ります',
    summary: last ? '反対の面から切り口を合わせ、首の骨を断ちます。' : '胸びれの根元から腹びれの後ろへ、斜めに包丁を入れます。',
    how: last ? ['胸びれの後ろから先ほどの切り口へ刃を引きます。',
      '首の骨の継ぎ目に刃元(はもと)を当て、板の方へ押し切ります。包丁を置いてから頭を移します。']
      : ['胸びれを頭の方へ寄せ、{L}手を切る線から外します。',
        '出刃包丁の中ほどをやや頭の方へ傾け、腹びれの付け根へ引きます。中骨に触れた所で止めます。'],
    tip: last ? '硬い所で止まったら刃を抜き、骨の継ぎ目に当て直します。' : '胸びれのすぐ後ろから入ると、肩の厚い身を胴に残せます。',
    mistake: last ? '硬い骨に当てたまま刃をねじると、切り口から外れます。' : 'ひれから離れた所を横に切ると、肩の肉まで頭に付きます。',
    done: last ? '胸びれと腹びれが頭に付き、首の切り口が見えます。' : '片側は中骨まで開き、頭は反対の面で胴につながっています。',
    place: last ? headLeftBack : headLeft, pose: last ? LF : LB,
    hands: [hand('opercleTop', '{L}手を頭に添え、指を刃筋から離します。')],
    labels: [mark('pectoralBase', '胸鰭(むなびれ)')], camera: shot('closeup', line('headCut', side), 1.28),
    durationMs: last ? 6200 : 5100,
    cuts: [cut('neck', 'headCut', side, 'deba', last ? 'press' : 'pull', last ? 'heel' : 'mid', 15, [0.30, 0.67], last)],
    moves: last ? [move(k, 'head', [-7, 0, -5], [0.74, 0.96])] : [],
    ...changes,
  });
}

export function gut(k, changes = {}) {
  return step({
    id: 'gut', title: '腹を開いてわたを出します', summary: '首の切り口から肛門まで、内臓の上を覆う皮を浅く開きます。',
    how: ['背側を{L}手で支え、首の下から切っ先（刃の先端）を浅く入れます。腹の縁に沿って肛門へ引きます。',
      '包丁を置いて腹を広げ、わたを受け皿へ移します。'],
    tip: '刃先の向きを皮とそろえると、腹の奥へ突き込みにくくなります。',
    mistake: '切っ先を背骨へ向けて深く入れると、わたを傷つけます。',
    done: '腹が開き、背骨の下の暗い筋が見えます。', place: neckRight, pose: RB,
    hands: [hand('dorsalFinStart', '{L}手を背側に添えます。', 'R.dorsal')],
    labels: [mark('vent', '肛門(こうもん)')], camera: shot('closeup', 'cavityStart', 1.24), durationMs: 6800,
    cuts: [cut('slit', 'bellySlit', null, 'deba', 'pull', 'tip', 12, [0.30, 0.55], false, true)],
    uniforms: { slitOpen: { to: 1, window: [0.32, 0.63] } },
    moves: [move(k, 'viscera', [0, 1.1, 3.4], [0.63, 0.81]), hide('viscera', [0.82, 0.97])],
    practice: practice('slit', 0.4), ...changes,
  });
}

export function wash(k, membrane = false, changes = {}) {
  return step({
    id: 'wash', title: '背骨の溝を洗います', summary: '腹を広げ、背骨の下の溝に残った血を流水で落とします。',
    how: [membrane ? '切っ先で溝を覆う膜だけを浅く開きます。包丁を置き、弱い流水と清潔なブラシで溝を洗います。'
      : '腹の縁を広げて背骨の下をのぞき、弱い流水で溝の血を洗い流します。',
    'ペーパーで腹と皮の水を拭きます。身に触れる前に、手と包丁とまな板を洗います。'],
    tip: '水をかける前に腹を広げると、血の塊が残った場所を見つけやすくなります。',
    mistake: '薄い腹の身を強くこすると、身まで崩れます。',
    done: '溝から血の塊が取れ、腹の内側に水がたまっていません。',
    place: neckRight, pose: RB, hands: [hand('cavityStart', '{L}手で腹の縁を支えます。', 'R.ventral')],
    labels: [mark('cavityStart', '血わた')], camera: shot('closeup', 'cavityStart', 1.3), durationMs: 5900,
    cuts: membrane ? [cut('membrane', 'kidneyLine', null, 'deba', 'push', 'tip', 8, [0.16, 0.36])] : [],
    effects: [{ kind: 'water', ...line('kidneyLine'), window: [0.46, 0.84] }],
    moves: [move(k, 'kidney', [0, 0.3, 1.2], [0.51, 0.84], { opacity: 0, visible: false })],
    uniforms: { slitOpen: { to: 0, window: [0.85, 0.99] } }, highlight: [line('kidneyLine')], safety: rinseBlood,
    ...changes,
  });
}

// 腹から入る面は腹を手前、背から入る面は背を手前にする。同じ側面を上にした半回転を別手順で示す。
export function openEdge(side, edge, changes = {}) {
  const belly = edge === 'ventralCut', right = side === 'R';
  const pose = belly ? (right ? RB : LB) : (right ? LF : RF);
  return step({
    id: right ? 'right-belly' : 'left-edge', title: right ? '腹から中骨を探ります' : (belly ? 'もう片面の腹を開きます' : 'もう片面の背を開きます'),
    summary: belly ? '腹側のひれの際に切り口を作り、そこから中骨まで身を開きます。'
      : '骨の付いた面を下に置き直し、背びれの際から中骨まで開きます。',
    how: [belly ? '切っ先を腹の切り口へ戻し、尻びれのすぐ上を尾の付け根へ浅く引きます。'
      : '切っ先を背びれのすぐ脇に入れ、頭の切り口から尾の付け根へ引きます。',
    'できた筋に刃の中ほどを戻し、寝かせた刃に骨の手応えが伝わるまで切り口を深めます。'],
    tip: '皮を浅く開いてから同じ道をたどると、ひれの際を追えます。',
    mistake: '最初から深く押し込むと、骨から刃が離れて身に入ります。',
    done: '尾の近くまで切り口が続き、刃に骨が軽く触れます。',
    place: belly ? (right ? neckRight : neckLeft) : (right ? neckLeftBack : neckRightBack), pose,
    hands: [hand(belly ? 'headCutTop' : 'headCutBottom', belly ? '{L}手を背寄りに平らに添えます。' : '{L}手で肩の腹寄りを支えます。', side + '.dorsal')],
    labels: [mark(belly ? 'analFinStart' : 'dorsalFinStart', belly ? '尻鰭(しりびれ)' : '背鰭(せびれ)')],
    camera: shot('cook', line(edge, side), 1.14), durationMs: 5400,
    cuts: [cut('edge', edge, side, 'deba', 'pull', 'tip', 16, [0.28, 0.82])],
    ...changes,
  });
}

export function freeFillet(k, side, edge, tailFirstOnBack = false, changes = {}) {
  const right = side === 'R', back = edge === 'dorsalCut', reverseEdge = back && tailFirstOnBack;
  const pose = back ? (right ? LF : RF) : (right ? RB : LB);
  return step({
    id: right ? 'right-fillet' : 'left-fillet', title: right ? '一枚目の身を外します' : 'もう一枚の身を外します',
    summary: '同じ面を上にして魚を半回転させ、反対の縁からも中骨まで開きます。',
    how: [back ? (reverseEdge ? '背びれの際へ切っ先を入れ、尾から頭の方へ引いて中骨に届かせます。' : '背びれの際を頭側から尾へ引き、先ほどの腹側の切り口まで刃を寝かせて開きます。')
      : '腹の縁を尾へ浅く引き、刃の中ほどを寝かせて背側の切り口につなぎます。',
    '尾の付け根で身と中骨の間に刃を入れます。刃の中ほどを骨に沿わせ、尾から頭の切り口へ滑らせます。',
    '尾に残ったつながりを切り、包丁を置いてから身を移します。'],
    tip: '引っかかる所は身を少し開き、骨につながった所だけを切ります。',
    mistake: '刃が届く前に身を引き上げると、骨に付いている身が裂けます。',
    done: right ? '片身(かたみ)が一枚外れ、もう一方の身に中骨が残っています。' : '身が二枚に分かれ、尾の付いた中骨が一本残っています。',
    place: back ? (right ? neckLeftBack : neckRightBack) : (right ? neckRight : neckLeft), pose,
    hands: [hand(back ? 'analFinStart' : 'dorsalFinStart', '{L}手で身を支え、刃の出口を空けます。', side + '.dorsal')],
    camera: shot('cook', line('boneCut', side), 1.12), durationMs: 8700,
    cuts: [cut('edge', edge, side, 'deba', 'pull', 'tip', 16, [0.26, 0.41], false, reverseEdge),
      cut('spine', 'boneCut', side, 'deba', 'pull', 'mid', 7, [0.51, 0.73], true, true),
      cut('tail', 'tailCut', side, 'deba', 'press', 'mid', 8, [0.76, 0.84], true)],
    moves: [move(k, side + '.dorsal', right ? [7, 0.3, -5] : [-7, 0.3, 5], [0.86, 1])],
    uniforms: { xray: { to: 0.42, window: [0.29, 0.46] } },
    labels: [mark('spineHeadEnd', '中骨(なかぼね)')], practice: practice('spine', 0.45), ...changes,
  });
}

export function ribs(k, changes = {}) {
  return step({
    id: 'ribs', title: '腹骨を薄くすきます', summary: '片身の皮を下にし、頭寄りのくぼみに並ぶ腹骨を薄く外します。',
    how: ['骨の根元に切っ先を入れます。刃の中ほどを寝かせ、骨の丸みに沿って腹の縁へ薄く引きます。',
      'もう一枚も腹の縁を手前に置き、同じように骨をすきます。'],
    tip: '背側の身を支えると、腹骨の丸みを目で追いながら刃を通せます。',
    mistake: '板へまっすぐ押し下げると、骨に腹の身が厚く付きます。',
    done: '弓なりの骨が膜と一緒に外れ、腹の縁に身が残っています。',
    place: '皮を下にし、腹の縁を手前にそろえます。', pose: LB,
    hands: ['R', 'L'].map(side => hand('headCutTop', '{L}手で背側の身を支えます。', side + '.dorsal')),
    labels: [mark('piece:R.strip', '腹骨(はらぼね)')], camera: shot('top', 'bodyCenter', 0.87), durationMs: 7900,
    cuts: [cut('ribs-r', 'ribStrip', 'R', 'deba', 'slice', 'mid', 8, [0.28, 0.47], true),
      cut('ribs-l', 'ribStrip', 'L', 'deba', 'slice', 'mid', 8, [0.69, 0.84], true)],
    moves: [turn('L.dorsal', 'z', 180, [0, 0.23]), move(k, 'R.strip', [2, 0, 3], [0.49, 0.61]),
      move(k, 'L.strip', [-2, 0, 3], [0.86, 1])],
    uniforms: { xray: { to: 0, window: [0, 0.22] } }, practice: practice('ribs-r', 0.4), ...changes,
  });
}

export function pinbones(k, changes = {}) {
  return step({
    id: 'pinbones', title: '小骨を一本ずつ抜きます', summary: '身を指でなで、中央に並んだ小骨の先を探します。',
    how: ['指の腹を尾から頭へ滑らせ、触れた骨を骨抜きでつまみます。',
      '根元の身を{L}手で支え、頭側へ傾いている骨をその向きに低く引き抜きます。両方の身を確かめます。'],
    tip: '骨をつまむ指と、身が浮かないように添える指を、骨の根元に寄せます。',
    mistake: '身から遠い骨先だけを真上に引くと、骨が折れたり身が浮いたりします。',
    done: '身の中央を指で往復しても、骨先が指に当たりません。',
    place: '皮を下に、身の切り口を上に置きます。', pose: LB,
    hands: ['R', 'L'].map(side => hand('cavityStart', '{L}手で小骨の脇を支えます。', side + '.dorsal')),
    labels: [mark('piece:pinbones.R', '血合骨(ちあいぼね)')], camera: shot('top', 'bodyCenter', 0.9), durationMs: 7100,
    cuts: [cut('pluck-r', 'pinBoneLine', 'R', 'tweezers', 'pluck', 'tip', 16, [0.27, 0.44], true),
      cut('pluck-l', 'pinBoneLine', 'L', 'tweezers', 'pluck', 'tip', 16, [0.61, 0.81], true)],
    moves: [move(k, 'pinbones.R', [-1.6, 1, 0], [0.46, 0.60], { opacity: 0, visible: false }),
      move(k, 'pinbones.L', [1.6, 1, 0], [0.82, 0.98], { opacity: 0, visible: false })],
    practice: practice('pluck-r', 0.35), ...changes,
  });
}

export function peel(k, byHand, changes = {}) {
  const tool = byHand ? 'thumb' : 'yanagi';
  return step({
    id: 'peel', title: byHand ? '薄皮を手でむきます' : '尾から皮を引きます',
    summary: byHand ? '頭の切り口で薄皮をつまみ、尾へ低く引いてむきます。' : '尾の端で皮をつかみ、寝かせた柳刃包丁を頭の方へ通します。',
    how: byHand ? ['頭の切り口を{L}にそろえ、肩の端から薄皮を{R}手でつまみます。',
      '{L}手で身を押さえ、はがれ際に指を寄せながら、薄皮を尾へ折り返すように引きます。']
      : ['皮を下に置き、尾の端で刃の中ほどを皮と身の間に入れます。',
        'ペーパー越しに{L}手で皮をつかみます。板に沿って刃を頭側へ送りながら、皮を尾の方へ引きます。'],
    tip: byHand ? '身が皮についてきたら、いったん止めて、身を押さえる指をはがれ際へ寄せます。' : '尾の皮を引くと、身を押しつぶさずに刃を進められます。',
    mistake: byHand ? '皮を上向きに引くと、薄い尾の身まで持ち上がります。' : '刃を起こして皮の方へ切り込むと、途中で皮が切れます。',
    done: byHand ? '薄皮が外れ、身の表面に銀色が残っています。' : '皮が一枚で離れ、皮の裏に身が厚く付いていません。',
    place: byHand ? '皮を上にし、頭の切り口を{L}にそろえます。' : '皮を下にし、尾の端を{L}にそろえます。', pose: byHand ? LB : RB,
    hands: ['R', 'L'].map(side => hand(byHand ? 'headCutTop' : 'peduncle',
      byHand ? '{L}手で皮の際の身を支えます。' : '{L}手で尾の皮をつかみます。', byHand ? side + '.dorsal' : 'skin.' + side)),
    camera: shot('top', 'bodyCenter', 0.85), durationMs: 8100,
    cuts: [cut('skin-r', 'skinPeel', 'R', tool, 'peel', byHand ? 'tip' : 'mid', 6, [0.27, 0.47], false, byHand),
      cut('skin-l', 'skinPeel', 'L', tool, 'peel', byHand ? 'tip' : 'mid', 6, [0.64, 0.84], false, byHand)],
    moves: [turn('R.dorsal', 'x', 180, [0, 0.22]), turn('L.dorsal', 'z', 0, [0, 0.22]),
      move(k, 'skin.R', [byHand ? 5 : -5, 0.4, -3], [0.47, 0.61]),
      move(k, 'skin.L', [byHand ? 5 : -5, 0.4, 3], [0.84, 0.99])],
    ...changes,
  });
}

const filletsFleshUp = '皮を下にし、腹の縁を手前に置きます。頭側は一枚目が{L}、二枚目が{R}です。';

const steps = [
  prep(['deba', 'scaler', 'tweezers'], '出刃包丁、うろこ取り、骨抜き、清潔な調理用ブラシ、ペーパーを用意します。', {
    tip: '冷やしたまま持ち帰り、えらと内臓は早めに取ります。わたを受ける器と、身を置く冷たい皿を分けておきます。',
    labels: [mark('bodyCenter', '{L}手の位置')], safety: washHands,
  }),
  scutes('L'), scutes('R'),
  headSide(k, 'L', false, { summary: '胸びれのすぐ後ろから腹びれの付け根へ、斜めに包丁を入れます。' }), headSide(k, 'R', true),
  gut(k), wash(k, true), openEdge('R', 'ventralCut'), freeFillet(k, 'R', 'dorsalCut'),
  openEdge('L', 'dorsalCut'), freeFillet(k, 'L', 'ventralCut'),
  ribs(k, { place: filletsFleshUp }), pinbones(k, { place: filletsFleshUp }),
  peel(k, true, {
    place: '皮を上にして頭側を{L}にそろえ、一枚目は背、二枚目は腹を手前にします。',
    safety: '刺身には「生食用」の表示がある身か、アニサキス対策の冷凍処理を確かめた身だけを使います。',
  }),
  step({
    id: 'done', title: '三枚おろしの完成です', summary: '身を清潔な皿へ移し、頭と中骨を分けて置きます。',
    how: ['腹の縁と身の中央をそっとなで、残った骨先がないか確かめます。',
      '頭と中骨は、えらや血を取り除いてあら汁に使えます。'],
    tip: 'すぐに調理しない身は、水気を拭いて冷蔵します。',
    mistake: '内臓を入れた器に身を戻すと、身に汚れが移ります。',
    done: '骨先の触れない片身が二枚、尾の付いた中骨が一本に分かれています。',
    place: '二枚の身を中骨の両脇に置きます。', pose: LB,
    hands: [hand('bodyCenter', '{L}手で身を支えます。', 'L.dorsal')],
    labels: [mark('piece:R.dorsal', '片身(かたみ)'), mark('piece:L.dorsal', '片身(かたみ)'), mark('spineHeadEnd', '中骨(なかぼね)')],
    camera: shot('top', 'bodyCenter', 0.82), durationMs: 3800,
  }),
];
export default { steps };
