import { controlGuide } from './title.js';
export const CRASH_REASONS = Object.freeze({ 'landing-hard': '着地が強すぎました',
  // 回し足りないときも、回しすぎたときも、同じ理由で転ぶ。「回りきれずに」だと、回しすぎた人には意味が通らなかった（体験の採点 1 周目）
  'landing-inverted': '回転が合わないまま着地しました',
  'landing-sideways': '横向きに着地しました', tree: '木にぶつかりました', rock: '岩にぶつかりました',
  building: '建物にぶつかりました', tower: 'リフトの柱にぶつかりました', water: '水に落ちました' });
/** まだやっていない操作を、1つずつ案内する（曲がる → 制動 → ジャンプ → 低い姿勢）。
 * 何か1つ操作したら全部消える作りでは、制動とジャンプの説明が二度と出なかった（採点 1 周目）。 */
export const STEP_HINTS = Object.freeze({
  keyboard: { steer: '左右キーで曲がる', brake: '下キーで制動（板を横に向けて雪を削る）',
    jump: '空白キーを押して離すとジャンプ（長く構えるほど高い）', tuck: '上キーで低い姿勢。平らな所では、押し続けると蹴って進む' },
  gamepad: { steer: '左スティックで曲がる', brake: 'スティックを下で制動（板を横に向けて雪を削る）',
    jump: '下のボタンを押して離すとジャンプ（長く構えるほど高い）', tuck: 'スティックを上で低い姿勢。平らな所では、倒し続けると蹴って進む' },
  touch: { steer: '左の舵で曲がる', brake: '舵を下で制動（板を横に向けて雪を削る）',
    jump: '右のボタンを押して離すとジャンプ（長く構えるほど高い）', tuck: '舵を上で低い姿勢。平らな所では、倒し続けると蹴って進む' },
});
const STEP_ORDER = ['steer', 'brake', 'jump', 'tuck'];
// 乱れた着地の原因は 2 つある（物理の決まり：向きのずれが 15° を超える／衝撃が大きい）。文言を片方に決め打ちすると、
// まっすぐ着地したのに「向きがずれた」と出て、理由が分からない（採点 3 周目）
export const LANDING_NOTES = Object.freeze({ clean: 'きれいに着地', heavy: '重い着地',
  sketchy: '着地が乱れました（板の向きが、進む向きとずれた）', rough: '着地が乱れました（着地の衝撃が大きかった）' });
const SKETCH_ANGLE = 15; // 度。物理の landingSketchAngle と同じ
/** 山の端（地図の端）に来たときの知らせ。端の手前で強い抵抗がかかって止まるので、理由を出さないと「なぜ進めないのか」が分からない */
export const BOUNDS_NOTE = 'ここが山の端です。向きを変えて戻りましょう';
/** 技の 1 行：「テール 180　＋419 点」 */
export const trickLine = trick => `${trick.name}　＋${Number(trick.score).toLocaleString('ja-JP')} 点`;
/** 駅の外で止まったときの案内。そばに「一本を終える」のボタンが出るので、同じ言葉をくり返さない */
export const STOP_NOTE = '止まりました。終えると記録を見られます';
/**
 * 止まったときの案内（続け方つき）。「終えると記録を見られます」だけだと、ゆるい道でうっかり止まった人が、滑り出し方に気づけない
 * （ゆるい斜面では、止まると、そのまま動かない。2026-11-11 の通しの確認）。案内を消している人には、短い文（STOP_NOTE）を出す
 */
export const STOP_HOW = Object.freeze({
  keyboard: '止まりました。上キーを押し続けると、蹴って進みます。終えると、記録を見られます',
  gamepad: '止まりました。スティックを上へ倒し続けると、蹴って進みます。終えると、記録を見られます',
  touch: '止まりました。舵を上へ倒し続けると、蹴って進みます。終えると、記録を見られます',
});
/** 制動を押して止まっている間の案内。斜面では、制動を離すと、板の先が谷へ向いて滑り出す（物理の決まり） */
export const STOP_HELD = '止まっています。制動を離すと、谷へ向いて滑り出します。終えると、記録を見られます';
/** 一本を終えるボタンの文字。滑走中の案内・一時停止で同じ言い方にする（3 通りあった：画面の採点 2 周目） */
export const FINISH_TEXT = '一本を終える';
/** 道具に合わせた言い方へ直す：スキーは、平らな所を、蹴るのではなく、ストックで押して進む */
export const gearWording = (text, gear) => (gear === 'ski' ? text.replaceAll('蹴って進', 'ストックで押して進') : text);
export function hudContent({ state, reason, stoppedFor = 0, acted = false, done, landing = '', atBounds = false, hints = true, device = 'keyboard', play, airHint = '', braking = false, gear = 'board' }) {
  // 転んだときは、2 つの戻り方を両方案内する：直前の安全な所（イー）と、出発地点か仕掛けの手前（アール）。
  // 片方だけだと、仕掛けに挑み直す 1 操作に気づけなかった（体験の採点 1 周目）
  const recovery = device === 'keyboard' ? 'E キーで直前へ戻れます。R キーで、手前からやり直せます' : '「直前の地点へ戻る」で再開できます';
  const crashed = state.mode === 'crash';
  const steps = STEP_HINTS[device] ?? STEP_HINTS.keyboard;
  let message = '';
  if (crashed) message = `${CRASH_REASONS[reason] ?? '転倒しました'}。${recovery}`;
  else if (atBounds) message = `${BOUNDS_NOTE}。${recovery}`;
  // 技の名前と点は、あいだを空けて「＋」を付ける（「テール 180 419 点」は、180419 と読めた：画面の採点 1 周目）
  else if (play?.trick) message = trickLine(play.trick);
  else if (play?.notice) message = play.notice;
  else if (landing) message = LANDING_NOTES[landing] ?? '';
  else if (play?.canFinish) message = !hints ? STOP_NOTE : braking ? STOP_HELD : (STOP_HOW[device] ?? STOP_HOW.keyboard);
  else if (hints && airHint) message = airHint;
  else if (hints && stoppedFor >= 3) message = `谷へ向けるか、${steps.tuck.split('。')[1] ?? '上を押し続けると蹴って進む'}。${recovery}`;
  else if (hints && !acted) message = controlGuide(device);
  // 地上の操作の案内は、空中では出さない（空中で「左右キーで曲がる」と出ていた）
  else if (hints && done && state.mode !== 'air') { const next = STEP_ORDER.find(key => !done[key]); if (next) message = steps[next]; }
  message = gearWording(message, gear);
  return { speed: String(Math.round(Math.max(0, state.speed || 0) * 3.6)), altitude: String(Math.round(state.pos?.y || 0)), message, recover: crashed, canFinish: !!play?.canFinish && !crashed && state.mode !== 'air', score: play?.run?.score || 0 };
}
/** 表示履歴だけを持つ。物理の状態には書き込まない。 */
export function createHudTracker() {
  let stoppedFor = 0, acted = false, reason, landing = '', landingFor = 0, airTime = 0, boundsFor = 0;
  let flew = false, spun = false, flipped = false;
  const done = { steer: false, brake: false, jump: false, tuck: false };
  return {
    update({ state, events = [], dt = 0, input = {}, ...options }) {
      stoppedFor = state.speed < .3 && state.mode !== 'air' ? stoppedFor + dt : 0;
      if (Math.abs(input.steer) > .1) done.steer = true;
      if (input.brake > .1) done.brake = true;
      if (input.jump) done.jump = true;
      if (input.tuck > .1) done.tuck = true;
      if (done.steer || done.brake || done.jump || done.tuck) acted = true;
      if (state.mode === 'air') airTime = Math.max(airTime, state.air?.time ?? 0);
      if (state.mode === 'air' && (state.air?.time ?? 0) >= .6) flew = true;
      if (flew && state.mode === 'air' && input.jump && Math.abs(input.steer ?? 0) > .1) spun = true;
      if (spun && state.mode === 'air' && input.jump && ((input.tuck ?? 0) > .1 || (input.brake ?? 0) > .1)) flipped = true;
      for (const event of events) {
        if (event.type === 'crash') reason = event.reason;
        if (event.type === 'bounds') boundsFor = 4;
        // 着地の良し悪しは、はっきり飛んだとき（0.35 秒以上）だけ知らせる。小さな浮きのたびに出すと、うるさい
        if (event.type === 'land') {
          if ((event.air ?? 0) >= .6) flew = true;
          if (airTime >= .35 && event.quality) {
            landing = event.quality === 'sketchy' && Math.abs(event.yawDeg ?? 0) <= SKETCH_ANGLE ? 'rough' : event.quality;
            landingFor = 1.4;
          }
          airTime = 0;
        }
      }
      if (state.mode !== 'crash') reason = undefined;
      landingFor = Math.max(0, landingFor - dt); if (landingFor <= 0 || state.mode === 'crash') landing = '';
      boundsFor = Math.max(0, boundsFor - dt);
      const device = options.device ?? 'keyboard';
      const button = device === 'touch' ? '右のジャンプボタン' : device === 'gamepad' ? '下のボタン' : '空白キー';
      const steer = device === 'touch' ? '舵' : device === 'gamepad' ? '左スティック' : '方向キー';
      // 空中の技の案内：飛んでいる間は「いまやること」、地上では「次に飛んだとき」の言い方にする（地上で「空中で〜」と出て、場面と合わなかった）
      const flying = state.mode === 'air';
      const airHint = flew && !spun ? (flying ? `${button}を押している間、${steer}の左右で回る` : `次に飛んだら、空中で${button}を押しながら${steer}の左右で回れる`)
        : spun && !flipped ? (flying ? `${button}を押しながら、${steer}の上下で宙返り` : `次は、空中で${button}を押しながら${steer}の上下で宙返り`) : '';
      return hudContent({ airHint, state, stoppedFor, acted, done, landing, atBounds: boundsFor > 0, reason, braking: (input.brake ?? 0) > .1, ...options });
    },
    reset() { stoppedFor = 0; acted = false; reason = undefined; landing = ''; landingFor = 0; airTime = 0; boundsFor = 0; done.steer = done.brake = done.jump = done.tuck = false; },
  };
}
export function createHud({ document, onRecover, onFinish }) {
  const element = document.createElement('section'); element.dataset.screen = 'hud'; element.className = 'hud';
  element.setAttribute('aria-label', '滑走の表示');
  element.innerHTML = `<div class="readouts panel" data-readouts><p class="readout-speed"><span class="speed" data-speed>0</span> km/h</p><p class="readout-sub">標高 <span data-altitude>0</span> m</p><p class="readout-sub readout-score" data-score hidden></p></div>
    <div class="hud-center panel" data-message-wrap><p class="message" role="status" aria-live="polite" data-message></p>
    <div class="hud-actions"><button data-action="finish" data-finish hidden>${FINISH_TEXT}</button>
    <button data-action="safe" data-control="safe" data-recover><span class="label-long">直前の地点へ戻る</span><span class="label-short">直前へ戻る</span></button></div></div>`;
  element.querySelector('[data-finish]').addEventListener('click', () => onFinish?.());
  element.querySelector('[data-recover]').addEventListener('click', onRecover);
  return { element, update(model) {
    element.querySelector('[data-speed]').textContent = model.speed; element.querySelector('[data-altitude]').textContent = model.altitude;
    element.querySelector('[data-message]').textContent = model.message;
    const wrap = element.querySelector('[data-message-wrap]'); wrap.hidden = !model.message;
    // 指で遊ぶ画面では、案内の文は上へ、押すもの（転倒からの復帰・区切り）は下の中央（舵とジャンプのあいだ）へ分けて出す。
    // 文とボタンを 1 つの板にして下へ置くと、滑走者に重なった（画面の採点 1 周目・2 周目の点検）。分け方は見た目の決まり（shell.css）が持つ
    wrap.classList.toggle('has-actions', !!(model.recover || model.canFinish));
    element.querySelector('[data-recover]').hidden = !model.recover;
    element.querySelector('[data-finish]').hidden = !model.canFinish;
    element.querySelector('[data-score]').hidden = !model.score;
    element.querySelector('[data-score]').textContent = model.score ? `${Number(model.score).toLocaleString('ja-JP')} 点` : '';
  } };
}
