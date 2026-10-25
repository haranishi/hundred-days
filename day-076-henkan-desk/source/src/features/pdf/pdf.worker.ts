import { processCore, inspectPdf } from './core';
import { toConversionError } from '../../shared/errors';
import type { PdfWorkerRequest, PdfWorkerReply } from './worker-contract';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const { sources, options, inspectOnly } = event.data;
  try {
    const signal = new AbortController().signal;
    const reply: PdfWorkerReply = inspectOnly ? { type: 'inspection', ...(await inspectPdf(sources[0]!, signal)) } : { type: 'result', artifact: await processCore(sources, options, signal) };
    scope.postMessage(reply);
  } catch (error) { scope.postMessage({ type: 'error', error: toConversionError(error) } satisfies PdfWorkerReply); }
};
