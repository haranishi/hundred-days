export function createAudio(env = globalThis) {
  let context, enabled = false, pending = Promise.resolve();
  function sync() {
    pending = pending.catch(() => {}).then(async () => {
      if (!context) return;
      if (enabled && !env.document.hidden) {
        if (context.state === 'suspended') await context.resume();
      } else if (context.state === 'running') await context.suspend();
    }).catch(() => {});
    return pending;
  }
  // Creation/resume happen only during a user gesture, even for a saved preference.
  function unlock() {
    if (!enabled || env.document.hidden) return;
    const Audio = env.AudioContext || env.webkitAudioContext;
    if (!Audio) return;
    try {
      context ??= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }
  function play(kind) {
    if (!enabled || !context || context.state !== 'running' || env.document.hidden) return;
    const notes = { human: [440], cpu: [294], win: [440, 554, 660], lose: [330, 262] }[kind] || [440];
    try {
      notes.forEach((frequency, i) => {
        const start = context.currentTime + i * .10;
        const osc = context.createOscillator(), gain = context.createGain();
        osc.type = 'sine'; osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.065, start + .008);
        gain.gain.exponentialRampToValueAtTime(.001, start + .15);
        osc.connect(gain); gain.connect(context.destination); osc.start(start); osc.stop(start + .16);
      });
    } catch { /* An unavailable device must not interrupt play. */ }
  }
  const visibility = () => { void sync(); };
  env.document.addEventListener('visibilitychange', visibility);
  return { setEnabled(value) { enabled = value; if (!enabled) void sync(); }, unlock, play,
    dispose() { enabled = false; env.document.removeEventListener('visibilitychange', visibility); void sync(); } };
}
