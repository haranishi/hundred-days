// 手順の音声読み上げ（speechSynthesis・日本語・任意）。非対応環境では静かに無効化する。

export function isSpeechSupported(win = typeof window !== 'undefined' ? window : null) {
  return Boolean(win && win.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');
}

export function createSpeechManager({ win = typeof window !== 'undefined' ? window : null } = {}) {
  const supported = isSpeechSupported(win);

  function pickJapaneseVoice() {
    if (!supported || typeof win.speechSynthesis.getVoices !== 'function') return null;
    const voices = win.speechSynthesis.getVoices() || [];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
  }

  function stop() {
    if (!supported) return;
    try {
      win.speechSynthesis.cancel();
    } catch {
      // 読み上げ停止の失敗は無視する
    }
  }

  function speak(text) {
    if (!supported || !text) return false;
    try {
      win.speechSynthesis.cancel();
      const utt = new win.SpeechSynthesisUtterance(String(text));
      utt.lang = 'ja-JP';
      utt.rate = 0.96;
      const voice = pickJapaneseVoice();
      if (voice) utt.voice = voice;
      win.speechSynthesis.speak(utt);
      return true;
    } catch {
      return false;
    }
  }

  return {
    isSupported: () => supported,
    speak,
    stop,
  };
}
