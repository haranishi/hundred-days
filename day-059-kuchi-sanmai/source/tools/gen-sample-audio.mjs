// Deterministic diagnostic tones created from a sine wave. No speech, TTS, samples, or songs.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sampleRate = 48_000
const durationSeconds = 14
const frequencyHz = 240
const smallAmplitude = 0.075
const openAmplitude = 0.24
const cycleSeconds = 2
const rampSeconds = 0.02
const sampleCount = sampleRate * durationSeconds
const pcmBytes = sampleCount * 2
const wave = Buffer.alloc(44 + pcmBytes)

wave.write('RIFF', 0)
wave.writeUInt32LE(36 + pcmBytes, 4)
wave.write('WAVE', 8)
wave.write('fmt ', 12)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20) // Uncompressed PCM.
wave.writeUInt16LE(1, 22) // Mono.
wave.writeUInt32LE(sampleRate, 24)
wave.writeUInt32LE(sampleRate * 2, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(pcmBytes, 40)

const ease = (progress) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, progress)))
const crossfade = (from, to, progress) => from + (to - from) * ease(progress)

function amplitudeAt(time) {
  const local = time % cycleSeconds
  if (local < 0.15 || local >= 1.65) return 0
  let amplitude = local < 0.65 || local >= 1.4 ? smallAmplitude : openAmplitude
  if (local >= 0.65 - rampSeconds && local < 0.65 + rampSeconds) {
    amplitude = crossfade(smallAmplitude, openAmplitude, (local - 0.65 + rampSeconds) / (rampSeconds * 2))
  } else if (local >= 1.4 - rampSeconds && local < 1.4 + rampSeconds) {
    amplitude = crossfade(openAmplitude, smallAmplitude, (local - 1.4 + rampSeconds) / (rampSeconds * 2))
  }
  return amplitude * ease((local - 0.15) / rampSeconds) * ease((1.65 - local) / rampSeconds)
}

let peak = 0
for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate
  const signal = amplitudeAt(time) * Math.sin(2 * Math.PI * frequencyHz * time)
  const value = Math.round(signal * 32_767)
  wave.writeInt16LE(value, 44 + index * 2)
  peak = Math.max(peak, Math.abs(value) / 32_768)
}

function rms(startSeconds, endSeconds) {
  const first = Math.round(startSeconds * sampleRate)
  const last = Math.min(sampleCount, Math.round(endSeconds * sampleRate))
  let squares = 0
  for (let index = first; index < last; index += 1) {
    const sample = wave.readInt16LE(44 + index * 2) / 32_768
    squares += sample * sample
  }
  return Math.sqrt(squares / (last - first))
}

const measured = { silence: rms(0, 0.1), small: rms(0.25, 0.55), open: rms(0.75, 1.25) }
let firstWindowMax = 0
let windowMax = 0
const observedStates = new Set()
for (let first = 0; first + 2048 <= sampleCount; first += 1024) {
  const level = rms(first / sampleRate, (first + 2048) / sampleRate) * 3
  windowMax = Math.max(windowMax, level)
  if (first + 2048 <= sampleRate * 1.6) firstWindowMax = Math.max(firstWindowMax, level)
  observedStates.add(level >= 0.22 ? 'open' : level >= 0.08 ? 'small' : 'closed')
}
assert.equal(measured.silence, 0)
assert.ok(measured.small * 3 > 0.1 && measured.small * 3 < 0.2)
assert.ok(measured.open * 3 > 0.3)
assert.ok(firstWindowMax > 0.22)
assert.ok(peak < 1)
assert.deepEqual([...observedStates].sort(), ['closed', 'open', 'small'])

const directory = fileURLToPath(new URL('../public/sample/', import.meta.url))
const destination = fileURLToPath(new URL('../public/sample/demo-tone.wav', import.meta.url))
await mkdir(directory, { recursive: true })
await writeFile(destination, wave)
const rounded = (value) => Number(value.toFixed(6))
console.log(JSON.stringify({
  generated: 'public/sample/demo-tone.wav',
  durationSeconds, sampleRate, channels: 1, bitsPerSample: 16, frequencyHz,
  sizeBytes: wave.byteLength,
  peakAmplitude: rounded(peak),
  peakDbFS: rounded(20 * Math.log10(peak)),
  rms: Object.fromEntries(Object.entries(measured).map(([key, value]) => [key, rounded(value)])),
  levelAtSensitivity3: Object.fromEntries(Object.entries(measured).map(([key, value]) => [key, rounded(value * 3)])),
  maxWindowLevel: rounded(windowMax),
  first1_6SecondsMaxWindowLevel: rounded(firstWindowMax),
  observedMouthStates: [...observedStates],
}, null, 2))
