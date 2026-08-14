"use strict";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK_NOTES = new Set([1, 3, 6, 8, 10]);
const START_MIDI = 60;
const END_MIDI = 84;

const SHORTCUTS = new Map([
  ["z", 60],
  ["s", 61],
  ["x", 62],
  ["d", 63],
  ["c", 64],
  ["v", 65],
  ["g", 66],
  ["b", 67],
  ["h", 68],
  ["n", 69],
  ["j", 70],
  ["m", 71],
  ["q", 72],
  ["2", 73],
  ["w", 74],
  ["3", 75],
  ["e", 76],
  ["r", 77],
  ["5", 78],
  ["t", 79],
  ["6", 80],
  ["y", 81],
  ["7", 82],
  ["u", 83],
  ["i", 84],
]);

const SHORTCUT_BY_MIDI = new Map([...SHORTCUTS].map(([shortcut, midi]) => [midi, shortcut]));
const pianoElement = document.querySelector("#piano");
const currentNoteElement = document.querySelector("#current-note");
const currentFrequencyElement = document.querySelector("#current-frequency");
const volumeInput = document.querySelector("#volume");
const volumeValue = document.querySelector("#volume-value");
const sustainButton = document.querySelector("#sustain");
const stopAllButton = document.querySelector("#stop-all");

let audioContext = null;
let masterGain = null;
let compressor = null;
let sustainEnabled = false;

const voices = new Map();
const activeSources = new Map();
const sustainedNotes = new Set();
const keyElements = new Map();

function isBlack(midi) {
  return BLACK_NOTES.has(midi % 12);
}

function noteLabel(midi) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function frequencyFor(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();

    masterGain = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.2;

    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
    setVolume(Number(volumeInput.value));
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
}

function createVoice(midi) {
  ensureAudio();

  const now = audioContext.currentTime;
  const frequency = frequencyFor(midi);
  const envelope = audioContext.createGain();
  const warmTone = audioContext.createBiquadFilter();
  const fundamental = audioContext.createOscillator();
  const overtone = audioContext.createOscillator();
  const overtoneGain = audioContext.createGain();

  warmTone.type = "lowpass";
  warmTone.frequency.setValueAtTime(Math.min(5200, frequency * 12), now);
  warmTone.Q.value = 0.7;

  fundamental.type = "triangle";
  fundamental.frequency.setValueAtTime(frequency, now);
  fundamental.detune.value = -2;

  overtone.type = "sine";
  overtone.frequency.setValueAtTime(frequency * 2, now);
  overtone.detune.value = 3;
  overtoneGain.gain.value = 0.13;

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.72, now + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.24, now + 0.55);

  fundamental.connect(warmTone);
  overtone.connect(overtoneGain);
  overtoneGain.connect(warmTone);
  warmTone.connect(envelope);
  envelope.connect(masterGain);

  fundamental.start(now);
  overtone.start(now);

  const voice = { envelope, fundamental, overtone, released: false };
  voices.set(midi, voice);
  return voice;
}

function releaseVoice(midi, releaseSeconds = 0.7) {
  const voice = voices.get(midi);
  if (!voice || voice.released || !audioContext) return;

  voice.released = true;
  const now = audioContext.currentTime;
  voice.envelope.gain.cancelScheduledValues(now);
  voice.envelope.gain.setValueAtTime(Math.max(voice.envelope.gain.value, 0.0001), now);
  voice.envelope.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
  voice.fundamental.stop(now + releaseSeconds + 0.04);
  voice.overtone.stop(now + releaseSeconds + 0.04);

  window.setTimeout(() => {
    if (voices.get(midi) === voice) voices.delete(midi);
  }, (releaseSeconds + 0.1) * 1000);
}

function updateCurrentNote(midi) {
  currentNoteElement.textContent = noteLabel(midi);
  currentFrequencyElement.textContent = `${frequencyFor(midi).toFixed(1)} Hz`;
}

function updateKeyState(midi) {
  const hasSources = (activeSources.get(midi)?.size ?? 0) > 0;
  const isSounding = hasSources || sustainedNotes.has(midi);
  keyElements.get(midi)?.classList.toggle("is-active", isSounding);
}

function pressNote(midi, sourceId) {
  const sources = activeSources.get(midi) ?? new Set();
  if (sources.has(sourceId)) return;

  sources.add(sourceId);
  activeSources.set(midi, sources);
  sustainedNotes.delete(midi);

  if (!voices.has(midi) || voices.get(midi).released) {
    createVoice(midi);
  }

  updateKeyState(midi);
  updateCurrentNote(midi);
}

function releaseNote(midi, sourceId) {
  const sources = activeSources.get(midi);
  if (!sources) return;

  sources.delete(sourceId);
  if (sources.size > 0) return;

  activeSources.delete(midi);
  if (sustainEnabled) {
    sustainedNotes.add(midi);
  } else {
    releaseVoice(midi);
  }
  updateKeyState(midi);
}

function setSustain(enabled) {
  sustainEnabled = enabled;
  sustainButton.setAttribute("aria-pressed", String(enabled));

  if (!enabled) {
    for (const midi of sustainedNotes) {
      if (!activeSources.has(midi)) releaseVoice(midi);
      updateKeyState(midi);
    }
    sustainedNotes.clear();
  }
}

function stopAll() {
  setSustain(false);
  activeSources.clear();
  sustainedNotes.clear();
  for (const midi of voices.keys()) {
    releaseVoice(midi, 0.08);
    updateKeyState(midi);
  }
  currentNoteElement.textContent = "—";
  currentFrequencyElement.textContent = "音を停止しました";
}

function setVolume(value) {
  const safeValue = Math.min(100, Math.max(0, value));
  volumeValue.value = `${safeValue}%`;
  volumeValue.textContent = `${safeValue}%`;
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime((safeValue / 100) * 0.7, audioContext.currentTime, 0.015);
  }
}

function buildPiano() {
  const whiteCount = Array.from({ length: END_MIDI - START_MIDI + 1 }, (_, index) => START_MIDI + index)
    .filter((midi) => !isBlack(midi)).length;
  pianoElement.style.setProperty("--white-count", String(whiteCount));

  let whiteBefore = 0;
  for (let midi = START_MIDI; midi <= END_MIDI; midi += 1) {
    const black = isBlack(midi);
    const key = document.createElement("button");
    const shortcut = SHORTCUT_BY_MIDI.get(midi)?.toUpperCase() ?? "";
    const label = noteLabel(midi);

    key.type = "button";
    key.className = `key key--${black ? "black" : "white"}`;
    key.dataset.midi = String(midi);
    key.setAttribute("aria-label", `${label}の音。キーボードは${shortcut}キー`);
    key.innerHTML = `
      <span class="key__label" aria-hidden="true">
        <span class="key__note">${label}</span>
        <span class="key__shortcut">${shortcut}</span>
      </span>
    `;

    if (black) {
      key.style.setProperty("--white-before", String(whiteBefore));
    } else {
      whiteBefore += 1;
    }

    const sourceId = (pointerId) => `pointer:${pointerId}`;
    key.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      key.setPointerCapture(event.pointerId);
      pressNote(midi, sourceId(event.pointerId));
    });
    key.addEventListener("pointerup", (event) => releaseNote(midi, sourceId(event.pointerId)));
    key.addEventListener("pointercancel", (event) => releaseNote(midi, sourceId(event.pointerId)));
    key.addEventListener("lostpointercapture", (event) => releaseNote(midi, sourceId(event.pointerId)));
    key.addEventListener("keydown", (event) => {
      if ((event.code !== "Enter" && event.code !== "Space") || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      pressNote(midi, `accessible:${midi}`);
    });
    key.addEventListener("keyup", (event) => {
      if (event.code !== "Enter" && event.code !== "Space") return;
      event.preventDefault();
      event.stopPropagation();
      releaseNote(midi, `accessible:${midi}`);
    });
    key.addEventListener("blur", () => releaseNote(midi, `accessible:${midi}`));

    keyElements.set(midi, key);
    pianoElement.append(key);
  }
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.target instanceof HTMLInputElement) return;

  if (
    event.target instanceof HTMLButtonElement &&
    (event.code === "Space" || event.code === "Enter")
  ) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    setSustain(!sustainEnabled);
    return;
  }

  const shortcut = event.key.toLowerCase();
  const midi = SHORTCUTS.get(shortcut);
  if (midi === undefined) return;

  event.preventDefault();
  pressNote(midi, `keyboard:${shortcut}`);
});

document.addEventListener("keyup", (event) => {
  const shortcut = event.key.toLowerCase();
  const midi = SHORTCUTS.get(shortcut);
  if (midi === undefined) return;

  event.preventDefault();
  releaseNote(midi, `keyboard:${shortcut}`);
});

window.addEventListener("blur", () => {
  for (const [midi, sources] of activeSources) {
    for (const source of [...sources]) {
      if (source.startsWith("keyboard:")) releaseNote(midi, source);
    }
  }
});

volumeInput.addEventListener("input", () => setVolume(Number(volumeInput.value)));
sustainButton.addEventListener("click", () => setSustain(!sustainEnabled));
stopAllButton.addEventListener("click", stopAll);

buildPiano();
setVolume(Number(volumeInput.value));
