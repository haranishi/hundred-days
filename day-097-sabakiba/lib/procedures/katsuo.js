// 節取り。胸びれの周囲だけをそぎ、皮付きの四節を確認してから刺身用の皮引きへ進む。
import { SPECIES_META } from '../species/meta.js';
import {
  LB, LF, RF, clearBlade, cut, freeFillet, gut, hand, headLeft, headLeftBack, headSide, hide, line,
  mark, move, neckLeftBack, neckRightBack, openEdge, peel, practice, prep, ribs, shot, step,
} from './aji.js';

const k = SPECIES_META.katsuo.sizeCm.typical / 21;
const holdBody = [hand('bodyCenter', '{L}手で丸い胴を支えます。')];

function shoulderScales(side) {
  const first = side === 'L', window = [0.30, 0.82];
  return step({
    id: first ? 'shoulder' : 'shoulder-other', title: first ? '肩の硬いうろこをそぎます' : '裏の肩も薄くそぎます',
    summary: '胸びれの周りから前の背びれにかけて、板のように硬いうろこを外します。',
    how: ['頭の後ろを支え、胸びれのそばで硬いうろこの縁を探します。',
      '出刃包丁の中ほどを皮に寝かせ、硬い所の下へ浅く入れます。前後に小さく動かして背びれ側へそぎます。'],
    tip: '硬い部分の縁から刃を入れると、たたきに使う皮を広く残せます。',
    mistake: '普通の魚と同じように体じゅうを削ると、料理に使う皮まで失います。',
    done: '肩から刃を入れる所に硬いうろこが残らず、その周りに皮が残っています。',
    pose: first ? LB : LF, place: first ? headLeft : headLeftBack,
    hands: [hand('opercleTop', '{L}手で頭の後ろを支えます。')],
    labels: [mark('pectoralBase', '胸甲部(きょうこうぶ)'), mark('dorsalFinStart', '背鰭(せびれ)')],
    camera: shot('closeup', 'pectoralBase', 1.28), durationMs: 5800,
    // 全身を走るうろこ取りの線を避け、胸びれの後ろから背へ向く局所の線を使う。
    cuts: [cut('shield', 'headCut', side, 'deba', 'scrape', 'mid', 7, window, false, true)],
    effects: [{ kind: 'scales', ...line('headCut', side), window }],
    uniforms: { scale: { to: first ? 0.5 : 0, window } },
  });
}

function loosenFin(side) {
  const last = side === 'L';
  return step({
    id: last ? 'remove-fin' : 'loosen-fin', title: last ? '背びれを根元から外します' : '背びれの脇を切ります',
    summary: last ? '背を手前にしたまま魚を裏返し、背びれの反対の脇も切って硬い根元を外します。'
      : '背を手前に回し、硬い背びれの根元に沿って、片方の脇に細い切れ目を入れます。',
    how: last ? ['背びれの脇にまだ切れ目がない面を上にし、切っ先を浅く入れて根元に沿って引きます。',
      '包丁を置き、ペーパー越しにひれを持ち、尾側から頭側へ根元をはがします。']
      : ['{L}手で胴を安定させ、出刃包丁の切っ先で、背びれの根元のすぐ脇を浅く引きます。'],
    tip: last ? '引っかかる所は板に戻し、根元のつながりだけを切り足します。'
      : '先にひれの付け根を目でたどると、硬い部分の脇に刃を沿わせられます。',
    mistake: last ? '根元がつながったまま強く引くと、ひれの周りの身も付いてきます。'
      : 'ひれから離れた所へ深く刃を入れると、背の身まで削れます。',
    done: last ? '背びれの硬い根元が細い帯で外れています。' : 'ひれの片方の脇が、根元に沿って細く開いています。',
    place: last ? neckRightBack : neckLeftBack, pose: last ? RF : LF, hands: holdBody,
    labels: [mark('dorsalFinStart', '背びれの根元')], camera: shot('closeup', 'dorsalFinStart', 1.18), durationMs: last ? 6600 : 5000,
    cuts: [cut('fin-edge', 'dorsalCut', side, 'deba', 'pull', 'tip', 10, [0.30, last ? 0.62 : 0.80])],
    uniforms: { slitOpen: { to: 0, window: [0, 0.23] } },
  });
}

export default { steps: [
  prep(['deba', 'yanagi'], '魚が収まるまな板、出刃包丁、柳刃包丁、ペーパー、冷やしたバットを用意します。', {
    tip: 'カツオは丸くて転がりやすいので、胴を支えてから刃を当てます。待たせる身は冷蔵します。',
    safety: 'できたヒスタミンは加熱しても残ります。保冷が途切れて傷みが疑われる魚は食べません。',
  }),
  shoulderScales('L'), shoulderScales('R'),
  headSide(k, 'L', false, { hands: holdBody }), headSide(k, 'R', true, { hands: holdBody }),
  gut(k, {
    title: 'わたを出して腹を洗います', summary: '腹を浅く開いてわたを取り、中骨の下の血わたも洗い流します。',
    how: ['出刃包丁の切っ先（刃の先端）で首の切り口から肛門まで腹の皮を浅く引き、包丁を置いてわたを出します。',
      '中骨の下に残った血を水道水で洗い流し、ペーパーで腹の内側と皮を拭きます。手と包丁とまな板を洗います。'],
    done: '腹の中にわたや血の塊が残らず、水気も取れています。', durationMs: 8300,
    cuts: [cut('slit', 'bellySlit', null, 'deba', 'pull', 'tip', 12, [0.29, 0.47], false, true)],
    moves: [move(k, 'viscera', [1, 0.7, 3.3], [0.50, 0.65]), hide('viscera', [0.65, 0.74]),
      move(k, 'kidney', [0, 0.3, 1.3], [0.77, 0.94], { opacity: 0, visible: false })],
    effects: [{ kind: 'water', ...line('kidneyLine'), window: [0.75, 0.95] }],
    highlight: [line('bellySlit'), line('kidneyLine')], labels: [mark('cavityStart', '血わた')],
  }),
  loosenFin('R'), loosenFin('L'),
  openEdge('R', 'ventralCut', {
    summary: '魚を裏返し、最初に背びれの脇を切った面を上にして、腹側から中骨まで開きます。',
    how: ['頭の切り口を{R}にしたまま、腹を手前に返します。腹の切り口に切っ先を入れ、尻びれのすぐ上を尾の付け根へ浅く引きます。',
      '切り口に刃の中ほどを寝かせ、中骨に触れるまで開きます。'],
  }), freeFillet(k, 'R', 'dorsalCut', true, {
    tip: '片身が外れたら端だけをつままず、手のひらで広く受けてバットに寝かせます。',
  }),
  openEdge('L', 'ventralCut'), freeFillet(k, 'L', 'dorsalCut', true, {
    mistake: '大きな身を端だけで持ち上げると、重みで割れます。', safety: clearBlade,
  }),
  ribs(k),
  step({
    id: 'split-loins', title: '背と腹の四節に分けます', summary: '片身の中央を走る濃い赤色の血合いに沿って、背の身と腹の身を分けます。',
    how: ['片身の皮を下にし、腹の縁を手前に寄せます。柳刃包丁の中ほどを中央の筋に当てます。',
      '頭の切り口から尾へ引き、腹側の身を手前に移します。もう一枚の片身でも繰り返します。'],
    tip: '背と腹の身の境にある濃い赤色の筋肉が血合いです。首側から尾まで目でたどると、小骨の列を追えます。',
    mistake: '分けた節を片端だけで持つと、柔らかい身が自分の重みで割れます。',
    done: '背節(せぶし)が二本、腹節(はらぶし)が二本に分かれています。',
    place: '皮を下に、両方の腹の縁を手前に置きます。', pose: LB,
    hands: ['R', 'L'].map(side => hand('headCutTop', '{L}手で背の身を広く支えます。', side + '.dorsal')),
    labels: [mark('piece:R.dorsal', '背節(せぶし)'), mark('piece:R.ventral', '腹節(はらぶし)')],
    camera: shot('top', 'bodyCenter', 0.86), durationMs: 7700,
    cuts: [cut('loins-r', 'lateralSplit', 'R', 'yanagi', 'slice', 'mid', 12, [0.20, 0.41], true),
      cut('loins-l', 'lateralSplit', 'L', 'yanagi', 'slice', 'mid', 12, [0.60, 0.81], true)],
    // すでに外した腹骨の帯が、親の腹節と一緒に動かないようにする。
    moves: [move(k, 'R.ventral', [0, 0, 2.8], [0.42, 0.55]), move(k, 'R.strip', [2, 0, 0.2], [0.42, 0.55]),
      move(k, 'L.ventral', [0, 0, 2.8], [0.83, 0.97]), move(k, 'L.strip', [-2, 0, 0.2], [0.83, 0.97])],
  }),
  step({
    id: 'trim-bloodline', title: '血合いの骨をそぎます', summary: '節の切り口に残る血合いと小骨の列を、細い帯にして取り除きます。',
    how: ['濃い赤い筋に並ぶ骨を指で探します。刃の中ほどを列の脇に沿わせ、頭側から尾へ引いて薄くそぎます。',
      '四節の中央側を指でなで、硬い骨先が残っていないか調べます。'],
    tip: 'たたき用はここで皮付きのまま取り分けます。骨と一緒に取る血合いの幅は、料理に合わせます。',
    mistake: '骨の列から離れた所をそぐと、切り口に骨先が残ります。',
    safety: '表面だけをあぶるたたきは中心が生のままです。生食用で寄生虫対策を確認した魚を使います。',
    done: '四節の切り口に骨先が触れず、たたきに使う節には皮が残っています。',
    place: '皮を下にし、節の中央側の切り口を見ます。', pose: LB,
    hands: ['R', 'L'].map(side => hand('headCutTop', '{L}手で節を支え、指を筋から外します。', side + '.dorsal')),
    labels: [mark('bodyCenter', '血合(ちあい)', 'R.dorsal')], camera: shot('top', line('chiaiTrim', 'R'), 1.06), durationMs: 7100,
    cuts: [cut('trim-r', 'chiaiTrim', 'R', 'yanagi', 'slice', 'mid', 7, [0.20, 0.41], true),
      cut('trim-l', 'chiaiTrim', 'L', 'yanagi', 'slice', 'mid', 7, [0.60, 0.81], true)],
    moves: [move(k, 'pinbones.R', [0, 0.5, 1.3], [0.43, 0.56], { opacity: 0, visible: false }),
      move(k, 'pinbones.L', [0, 0.5, 1.3], [0.82, 0.96], { opacity: 0, visible: false })],
    practice: practice('trim-r', 0.42),
  }),
  peel(k, false, {
    title: '刺身用の節は皮を引きます', summary: '刺身にする生食用の節は、一節ずつ尾側の皮をつかんで引きます。',
    tip: '板に沿わせた刃へ皮を引き寄せます。待たせる節は冷蔵しておきます。',
    done: '刺身用の節は皮が一枚で離れ、身が割れずに残っています。',
  }),
] };
