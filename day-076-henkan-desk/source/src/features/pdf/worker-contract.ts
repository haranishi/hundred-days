import type { Artifact, ConversionError, SourceFile } from '../../shared/contracts';
import type { PdfOptions } from './types';
export type PdfWorkerRequest = { sources: readonly SourceFile[]; options: PdfOptions; inspectOnly: boolean };
export type PdfWorkerReply = { type: 'result'; artifact: Artifact } | { type: 'inspection'; pageCount: number } | { type: 'error'; error: ConversionError };
