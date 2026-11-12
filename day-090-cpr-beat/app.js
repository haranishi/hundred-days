import { DURATION, Session, MotionDetector } from './lib/rhythm.js';
import { Metronome } from './lib/metronome.js';

const $ = (id) => document.getElementById(id);
const selected = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
let phase = 'idle', session = null, raf = 0, countdownStart = 0, feedbackTimer = 0;
let previewTimer = 0, previewing = false, generation = 0, motionDetector = new MotionDetector();
let motionListener = null, motionWatchdog = 0, motionGeneration = 0, motionReady = false, pendingMotion = false;
let lastMotion = 0, feedbackKind = '', tapAnimation = 0, beatAnimation = 0;
const labels = { 'in-range': '目安の範囲内です。そのリズムで。', fast: '少し速め。間隔を、もう少しゆったり。', slow: '少しゆっくり。間隔を、少し短く。' };

function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
const metro = new Metronome(() => {
  if (selected('mode') !== 'guided' || (!previewing && phase !== 'running')) return;
  $('tap-pad').classList.add('is-beat'); clearTimeout(beatAnimation);
  beatAnimation = setTimeout(() => $('tap-pad').classList.remove('is-beat'), 130);
  if ($('vibration').checked && !previewing) {
    try { if (!navigator.vibrate(25)) { $('vibration').checked = false; notice('この環境では振動を開始できません。タップと画面で練習できます。'); } }
    catch { $('vibration').checked = false; }
  }
}, () => notice('音を開始できませんでした。画面のリズムで練習できます。端末の音量やブラウザの設定も確認してください。'));

function resetFeedback() {
  $('feedback').removeAttribute('data-kind'); feedbackKind = '';
  $('live-bpm').textContent = '—'; $('tap-count').textContent = '0';
}
function stopMotion() {
  motionGeneration += 1; clearTimeout(motionWatchdog);
  if (motionListener) window.removeEventListener('devicemotion', motionListener);
  motionListener = null; motionReady = false; pendingMotion = false;
}
function stopOutput() {
  metro.stop(); clearTimeout(previewTimer); previewing = false;
  $('preview').textContent = '▷ 音を聴く'; clearTimeout(tapAnimation); clearTimeout(beatAnimation);
  $('tap-pad').classList.remove('is-tapped', 'is-beat');
  try { navigator.vibrate?.(0); } catch { /* unavailable */ }
}
function lockSettings(lock) { $('settings').disabled = lock; $('start').disabled = lock || pendingMotion; }
function updateMode() {
  stopOutput();
  const memory = selected('mode') === 'memory';
  $('sound').disabled = memory; $('vibration').disabled = memory || typeof navigator.vibrate !== 'function';
  $('preview').disabled = memory;
  document.querySelectorAll('input[name="bpm"]').forEach((input) => { input.disabled = memory; });
  $('guide-note').textContent = memory ? '音・振動・お手本の動きは消えます。目標は100〜120回／分です。' : `毎分${selected('bpm')}回の一定したクリック音です。`;
}
function useTap(message) {
  document.querySelector('input[name="input"][value="tap"]').checked = true;
  $('motion-note').textContent = message;
  $('input-hint').textContent = '画面タップ、またはボタンにフォーカスしてスペースキー';
  $('pad-title').textContent = 'TAP'; $('pad-subtitle').textContent = '指先で、軽く。';
}
function tapFallback(message) {
  const active = phase === 'running' || phase === 'countdown';
  if (active) abort('スマホの動きを読み取れなくなったため中止しました。画面タップでやり直せます。');
  stopMotion(); useTap(message); lockSettings(false);
}
async function enableMotion() {
  stopOutput(); stopMotion(); const token = motionGeneration;
  pendingMotion = true; lockSettings(false);
  $('motion-note').textContent = '動きセンサーを確認しています…';
  if (!window.isSecureContext || typeof window.DeviceMotionEvent === 'undefined') {
    tapFallback('この環境では動きを使えません。画面タップで練習できます。'); return;
  }
  try {
    if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
      const permission = await window.DeviceMotionEvent.requestPermission();
      if (token !== motionGeneration || document.hidden) return;
      if (permission !== 'granted') { tapFallback('動きの使用が許可されませんでした。画面タップで練習できます。'); return; }
    }
    if (token !== motionGeneration || selected('input') !== 'motion') return;
    motionDetector = new MotionDetector();
    motionListener = (event) => {
      const now = performance.now(), detected = motionDetector.feed(event, now);
      if (!detected.valid) return;
      lastMotion = now;
      if (!motionReady) {
        motionReady = true; pendingMotion = false; clearTimeout(motionWatchdog); lockSettings(false);
        $('motion-note').textContent = '動きを確認しました。端末を握り、軽く上下に。回数は参考測定です。';
        $('input-hint').textContent = '端末を握って軽く上下に。強く振らず、人の胸へ押し当てないでください。';
      }
      if (detected.pulse && phase === 'running') record(now);
    };
    window.addEventListener('devicemotion', motionListener);
    motionWatchdog = setTimeout(() => { if (!motionReady) tapFallback('動きを読み取れませんでした。画面タップで練習できます。'); }, 2300);
  } catch { if (token === motionGeneration) tapFallback('動きの使用を開始できませんでした。画面タップで練習できます。'); }
}
function record(now = performance.now()) {
  if (phase !== 'running' || !session?.record(now)) return;
  $('tap-count').textContent = String(session.times.length);
  $('tap-pad').classList.add('is-tapped'); clearTimeout(tapAnimation);
  tapAnimation = setTimeout(() => $('tap-pad').classList.remove('is-tapped'), 100);
  const recent = session.recent();
  if (recent) {
    $('live-bpm').textContent = String(Math.round(recent.bpm));
    if (recent.classification !== feedbackKind) {
      feedbackKind = recent.classification; $('feedback').textContent = labels[feedbackKind]; $('feedback').dataset.kind = feedbackKind;
    }
  } else $('feedback').textContent = 'そのまま続けると、テンポが分かります。';
}
function beginRunning(at) {
  phase = 'running'; session = new Session(at);
  $('phase-label').textContent = 'PRACTICING / 30 SECONDS';
  $('instruction').textContent = selected('input') === 'motion' ? '端末を握って、軽く上下に。' : '指先で、リズムを刻もう。';
  $('pad-title').textContent = selected('input') === 'motion' ? 'MOVE' : 'TAP';
  $('pad-subtitle').textContent = selected('input') === 'motion' ? '動きは参考測定です' : '指先で、軽く。';
  $('tap-pad').disabled = selected('input') === 'motion';
  if (!$('tap-pad').disabled) $('tap-pad').focus({ preventScroll: true });
  $('feedback').textContent = '4回以上の入力で、テンポを表示します。';
  if (selected('mode') === 'guided') metro.start(Number(selected('bpm')), metro.audioReady, at + 80);
}
function tick(now) {
  if (phase === 'countdown') {
    const left = Math.ceil((3000 - (now - countdownStart)) / 1000);
    $('pad-title').textContent = String(Math.max(1, left));
    if (now >= countdownStart + 3000) beginRunning(countdownStart + 3000);
  }
  if (phase === 'running') {
    const elapsed = Math.min(DURATION, Math.max(0, now - session.start));
    $('remaining').textContent = String(Math.max(0, Math.ceil((DURATION - elapsed) / 1000)));
    $('progress').style.width = `${100 * elapsed / DURATION}%`;
    document.querySelector('.progress-track').setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
    if (selected('input') === 'motion' && now - lastMotion > 2500) { tapFallback('動きの更新が止まりました。画面タップに戻しました。'); return; }
    if (session.times.length && now - session.times.at(-1) > 1600 && now - feedbackTimer > 1500) {
      $('feedback').textContent = '入力が空いています。自分のペースで再開できます。'; $('feedback').removeAttribute('data-kind'); feedbackKind = ''; feedbackTimer = now;
    }
    if (elapsed >= DURATION) { finish(); return; }
  }
  if (phase === 'countdown' || phase === 'running') raf = requestAnimationFrame(tick);
}
async function start() {
  if (phase === 'preparing' || phase === 'running' || phase === 'countdown' || pendingMotion) return;
  if (selected('input') === 'motion' && !motionReady) { tapFallback('動きを使う場合は、もう一度「スマホの動き」を選んでください。'); return; }
  const token = ++generation; phase = 'preparing'; stopOutput(); notice(''); lockSettings(true);
  const guided = selected('mode') === 'guided';
  metro.audioReady = await metro.prepare(guided && $('sound').checked);
  if (token !== generation || document.hidden) return;
  session = null; resetFeedback(); $('result').hidden = true; $('remaining').textContent = '30';
  $('progress').style.width = '0%'; document.querySelector('.progress-track').setAttribute('aria-valuenow', '0');
  phase = 'countdown'; countdownStart = performance.now(); $('stop').hidden = false;
  $('tap-pad').disabled = true; $('pad-title').textContent = '3'; $('pad-subtitle').textContent = 'まもなく、スタート';
  $('phase-label').textContent = 'GET READY'; $('instruction').textContent = '3秒後に、30秒の練習が始まります。';
  $('feedback').textContent = '人の胸では練習しないでください。';
  document.querySelector('.instrument').scrollIntoView({ behavior: 'instant', block: 'center' });
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function finish() {
  phase = 'result'; stopOutput(); stopMotion(); cancelAnimationFrame(raf); lockSettings(false);
  $('tap-pad').disabled = true; $('stop').hidden = true; $('phase-label').textContent = 'PRACTICE COMPLETE';
  $('instruction').textContent = '30秒、おつかれさまでした。'; $('feedback').textContent = '下で、今回の入力のリズムを振り返れます。';
  $('remaining').textContent = '0'; $('progress').style.width = '100%';
  const data = session.result();
  $('result-bpm').textContent = data.enoughData ? String(Math.round(data.averageBpm)) : '—';
  $('result-percent').textContent = data.enoughData ? String(data.percent) : '—';
  $('result-taps').textContent = String(data.taps); $('result-gap').textContent = (data.longestGap / 1000).toFixed(1);
  $('result-message').textContent = !data.enoughData ? '測定に使える入力が足りませんでした。次は、30秒間リズムを続けてみましょう。' : data.longestGap > 2000 ? '入力が空いた時間がありました。次は、お手本に合わせて続けてみましょう。' : data.percent >= 80 ? '多くの入力間隔が、目安の範囲に入りました。次は音なしでも試してみましょう。' : 'リズムには少しばらつきがありました。お手本を聴いて、もう一度。';
  $('result-detail').textContent = `測定した${data.intervalCount}区間のうち、${data.inRange}区間が100〜120回／分の範囲内。開始・終了前の無入力も「最長の入力間隔」に含みます。${selected('input') === 'motion' ? '動きは参考測定です。' : ''}`;
  const chart = $('rhythm-chart'); chart.replaceChildren();
  for (const ms of data.intervals) {
    const bar = document.createElement('span'); const bpm = 60000 / ms;
    if (ms >= 500 - .000001 && ms <= 600 + .000001) bar.className = 'in-range';
    bar.style.height = `${Math.max(4, Math.min(100, bpm / 200 * 100))}%`;
    bar.title = `${Math.round(bpm)}回／分（${Math.round(ms)}ms）`; chart.append(bar);
  }
  chart.setAttribute('aria-label', `${data.intervalCount}区間のテンポ。範囲内${data.inRange}区間、範囲外${data.intervalCount - data.inRange}区間。`);
  $('result').hidden = false; $('result').focus({ preventScroll: true }); $('result').scrollIntoView({ behavior: 'instant', block: 'start' });
  if (selected('input') === 'motion') useTap('練習終了でセンサーを停止し、画面タップに戻しました。動きを使う場合は選び直してください。');
}
function abort(message = '練習を中止しました。設定を選んで、また始められます。') {
  generation += 1; cancelAnimationFrame(raf); stopOutput(); stopMotion(); phase = 'idle'; session = null;
  lockSettings(false); $('tap-pad').disabled = true; $('stop').hidden = true;
  $('phase-label').textContent = 'PAUSED'; $('instruction').textContent = '練習を中止しました。';
  $('pad-title').textContent = 'TAP'; $('pad-subtitle').textContent = 'また、ここから。';
  $('result').hidden = true; $('feedback').textContent = message; notice(message);
  if (selected('input') === 'motion') useTap('センサーを停止し、画面タップに戻しました。動きを使う場合は選び直してください。');
}
$('tap-pad').addEventListener('click', () => { if (selected('input') === 'tap') record(); });
$('tap-pad').addEventListener('keydown', (event) => { if (event.repeat && (event.key === ' ' || event.key === 'Enter')) event.preventDefault(); });
$('start').addEventListener('click', start); $('retry').addEventListener('click', start); $('stop').addEventListener('click', () => abort());
document.querySelectorAll('input[name="mode"],input[name="bpm"]').forEach((input) => input.addEventListener('change', updateMode));
document.querySelectorAll('input[name="input"]').forEach((input) => input.addEventListener('change', () => {
  if (selected('input') === 'motion') enableMotion(); else { stopMotion(); useTap('机に置いた端末を、指先で軽くタップします。'); lockSettings(false); }
}));
$('preview').addEventListener('click', async () => {
  if (previewing) { stopOutput(); generation += 1; return; }
  const token = ++generation; stopOutput(); previewing = true; $('preview').textContent = '□ 音を止める';
  const audio = await metro.prepare(true);
  if (token !== generation || !previewing || document.hidden) return;
  metro.start(Number(selected('bpm')), audio); previewTimer = setTimeout(stopOutput, 8000);
});
$('sound').addEventListener('change', stopOutput); $('vibration').addEventListener('change', stopOutput);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const active = ['preparing','countdown','running'].includes(phase);
  if (active) abort('画面を離れたため練習を中止しました。戻って、もう一度始められます。');
  else { generation += 1; stopOutput(); stopMotion(); lockSettings(false); if (selected('input') === 'motion') useTap('画面を離れたためセンサーを停止しました。画面タップに戻しています。'); }
});
window.addEventListener('pagehide', () => { generation += 1; stopOutput(); stopMotion(); cancelAnimationFrame(raf); });
if (typeof navigator.vibrate !== 'function') $('vibration').disabled = true;
updateMode();
