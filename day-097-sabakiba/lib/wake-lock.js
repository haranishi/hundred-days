// 画面を消さない機能（navigator.wakeLock）。対応環境のみ静かに動かし、タブ切替で解放・再取得する。

export function isWakeLockSupported(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return Boolean(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');
}

export function createWakeLockManager({
  nav = typeof navigator !== 'undefined' ? navigator : null,
  doc = typeof document !== 'undefined' ? document : null,
  onChange = null,
} = {}) {
  const supported = isWakeLockSupported(nav);
  let enabled = false;
  let sentinel = null;
  let disposed = false;

  const notify = () => {
    if (typeof onChange === 'function') {
      onChange({ supported, enabled, active: Boolean(sentinel) });
    }
  };

  async function release() {
    const current = sentinel;
    sentinel = null;
    if (current) {
      try {
        await current.release();
      } catch {
        // すでに解放済みでも無視する
      }
    }
    notify();
  }

  async function acquire() {
    if (!supported || !enabled || disposed) return false;
    if (doc && doc.visibilityState === 'hidden') return false;
    if (sentinel) return true;
    try {
      const next = await nav.wakeLock.request('screen');
      if (disposed || !enabled) {
        await next.release().catch(() => {});
        return false;
      }
      sentinel = next;
      if (typeof next.addEventListener === 'function') {
        next.addEventListener('release', () => {
          if (sentinel === next) {
            sentinel = null;
            notify();
          }
        });
      }
      notify();
      return true;
    } catch {
      sentinel = null;
      notify();
      return false;
    }
  }

  function handleVisibility() {
    if (!doc) return;
    if (doc.visibilityState === 'visible') {
      if (enabled) acquire();
    } else {
      release();
    }
  }

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', handleVisibility);
  }

  return {
    isSupported: () => supported,
    isActive: () => Boolean(sentinel),
    isEnabled: () => enabled,
    async setEnabled(flag) {
      enabled = Boolean(flag);
      if (enabled) {
        return acquire();
      }
      await release();
      return false;
    },
    dispose() {
      disposed = true;
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', handleVisibility);
      }
      release();
    },
  };
}
