export interface LoadingConfig {
  title: string;
  steps: string[];
  detail?: string;
}
export interface LoadingSnapshot {
  id: number;
  status: 'idle' | 'loading' | 'done' | 'error';
  title: string;
  steps: string[];
  step: number;
  detail: string;
  error: string;
}
export interface LoadingState {
  readonly snapshot: LoadingSnapshot;
  begin(config: LoadingConfig): number;
  step(id: number, index: number, detail: string): boolean;
  finish(id: number): boolean;
  fail(id: number, error: string): boolean;
}
export function createLoadingState(): LoadingState;
export function getLoadingScreen(): LoadingState;
export function loadingPaint(): Promise<void>;
