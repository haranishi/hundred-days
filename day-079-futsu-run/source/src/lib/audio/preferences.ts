/** Only sound preferences are stored; no player identifiers or game answers. */
export type AudioPreferences = {
  enabled: boolean;
  music: number;
  effects: number;
};
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = {
  enabled: true,
  music: 0.65,
  effects: 0.72,
};
export const AUDIO_PREFERENCES_KEY = "futsu-run-sound-v1";
export type AudioPreferenceStorage = Pick<Storage, "getItem" | "setItem">;
let memory: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  const data =
    value && typeof value === "object"
      ? (value as Partial<AudioPreferences>)
      : {};
  const volume = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate >= 0 &&
    candidate <= 1
      ? candidate
      : fallback;
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    music: volume(data.music, 0.65),
    effects: volume(data.effects, 0.72),
  };
}
function browserStorage(): AudioPreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
export function readAudioPreferences(
  storage: AudioPreferenceStorage | null = browserStorage(),
): AudioPreferences {
  try {
    const raw = storage?.getItem(AUDIO_PREFERENCES_KEY);
    if (raw) memory = normalizeAudioPreferences(JSON.parse(raw));
  } catch {
    /* Disabled or corrupt storage keeps the in-memory preference. */
  }
  return { ...memory };
}
export function saveAudioPreferences(
  value: AudioPreferences,
  storage: AudioPreferenceStorage | null = browserStorage(),
) {
  memory = normalizeAudioPreferences(value);
  try {
    storage?.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(memory));
  } catch {
    /* Preferences remain usable in private browsing. */
  }
}
