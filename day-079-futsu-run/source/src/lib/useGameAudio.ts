"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PreparedGameAudioSession } from "./audio/session";
export type { AudioScene } from "./audio/engine";
export type { PreparedGameAudioSession } from "./audio/session";
/** Playback is primed in the play gesture; this hook leases that existing graph. */
export function useGameAudio(
  preparedSession?: PreparedGameAudioSession | null,
) {
  const [session] = useState(
    () => preparedSession ?? new PreparedGameAudioSession(),
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => session.acquire(), [session]);
  return {
    ...snapshot,
    toggle: session.toggle,
    play: session.play,
    footstep: session.footstep,
    setScene: session.setScene,
    setMusicVolume: session.setMusicVolume,
    setEffectsVolume: session.setEffectsVolume,
  };
}
