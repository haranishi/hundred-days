import type { Artifact, ConversionError, ImageOptions, SourceFile } from '../../shared/contracts';
export type ImageWorkerRequest = { type: 'convert'; runId: string; source: SourceFile; options: ImageOptions; forceWasm?: boolean };
export type ImageWorkerResponse = { runId: string; id: string } & (
  { type: 'state'; state: 'validating' | 'converting' }
  | { type: 'result'; artifact: Artifact }
  | { type: 'error'; error: ConversionError }
);
