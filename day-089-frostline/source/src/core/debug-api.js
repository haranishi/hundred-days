export function debugEnabled({ enabled = false, dev = false, search = '' } = {}) {
  return enabled || dev || new URLSearchParams(search).get('debug') === '1';
}
/** 状態は必ず控えを返す。試験側から物理を直接書き換えられない。 */
export function installDebugApi({ target = globalThis.window, enabled, ready, info, state, events, input,
  loop, teleport, errors, restore, play, vista, views }) {
  if (!enabled || !target) return { dispose() {} };
  const api = { ready, info, errors, state: () => structuredClone(state()), events: () => structuredClone(events()),
    setInput: value => input.setVirtual(value), setManual: value => loop.setManual(value),
    advance: seconds => loop.advance(seconds), teleport,
    // 道具が状態を改変せず、実際に渡した操作を検査するための読み出し。
    input: () => input.current(), restore, play: () => structuredClone(play?.()),
    // 景色を見る：番号で視点を選ぶ（null で閉じる）。views は視点の一覧の写し
    vista: index => vista?.(index), views: () => views?.() ?? [],
  };
  const onError = e => errors.push(String(e.message ?? 'ページで問題が起きました'));
  const onRejection = e => errors.push(String(e.reason?.message ?? e.reason));
  target.addEventListener?.('error', onError); target.addEventListener?.('unhandledrejection', onRejection);
  target.__ginrei = api;
  return { dispose() {
    if (target.__ginrei === api) delete target.__ginrei;
    target.removeEventListener?.('error', onError); target.removeEventListener?.('unhandledrejection', onRejection);
  } };
}
