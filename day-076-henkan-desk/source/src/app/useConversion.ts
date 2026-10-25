import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artifact, ConversionError, ConversionEvent, ItemState, RunStarter, SourceFile } from '../shared/contracts';
import { toConversionError } from '../shared/errors';
export type ResultRow = { state: ItemState; artifact?: Artifact; error?: ConversionError };
const terminal = (state: ItemState) => ['succeeded', 'failed', 'cancelled'].includes(state);
export function useConversion(sources: readonly SourceFile[]) {
  const [rows, setRows] = useState<Record<string, ResultRow>>({});
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => { setRows(previous => Object.fromEntries(sources.map(source => [source.id, previous[source.id] ?? { state: 'ready' }]))); }, [sources]);
  const cancel = useCallback(() => {
    generation.current += 1; controller.current?.abort(); controller.current = null; running.current = false;
    setBusy(false); setRows(previous => Object.fromEntries(Object.entries(previous).map(([id, row]) => [id, terminal(row.state) ? row : { state: 'cancelled' }])));
  }, []);
  useEffect(() => () => { generation.current += 1; controller.current?.abort(); }, []);
  const startRun: RunStarter = useCallback(operation => {
    if (running.current) return;
    controller.current?.abort();
    const current = ++generation.current;
    const abort = new AbortController(); controller.current = abort; running.current = true; setBusy(true);
    const ids = new Set(sources.map(source => source.id));
    setRows(Object.fromEntries(sources.map(source => [source.id, { state: 'queued' }])));
    const emit = (event: ConversionEvent) => {
      if (current !== generation.current || abort.signal.aborted || !ids.has(event.id)) return;
      setRows(previous => {
        const old = previous[event.id] ?? { state: 'ready' };
        if (terminal(old.state)) return previous;
        const next = event.type === 'result' ? { ...old, artifact: event.artifact }
          : event.type === 'error' ? { ...old, error: event.error } : { ...old, state: event.state };
        return { ...previous, [event.id]: next };
      });
    };
    Promise.resolve().then(() => operation({ signal: abort.signal, emit })).catch(error => {
      if (current !== generation.current || abort.signal.aborted) return;
      const failure = toConversionError(error);
      setRows(previous => Object.fromEntries(Object.entries(previous).map(([id, row]) => [id, terminal(row.state) ? row : { state: 'failed', error: failure }])));
    }).finally(() => {
      if (current === generation.current) { running.current = false; setBusy(false); controller.current = null; }
    });
  }, [sources]);
  const clear = useCallback(() => { cancel(); setRows({}); }, [cancel]);
  return { rows, busy, startRun, cancel, clear };
}
