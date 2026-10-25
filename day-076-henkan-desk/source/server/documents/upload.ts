import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest } from 'fastify';
import { LIMITS } from '../../src/shared/limits.js';
import { checkAbort, DocumentError } from './errors.js';
import { kindFromFilename, type OfficeKind } from './formats.js';
export async function receiveDocument(request: FastifyRequest, destination: string, signal: AbortSignal, onLimit: () => void): Promise<OfficeKind> {
  let received = false, consent = false, bytes = 0; let kind: OfficeKind | undefined;
  const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > LIMITS.docxFileBytes + 16384) onLimit(); };
  request.raw.on('data', count);
  try {
    for await (const part of request.parts({ limits: { files: 1, fields: 1, parts: 2, fileSize: LIMITS.docxFileBytes, fieldSize: 4, fieldNameSize: 32, headerPairs: 20 } })) {
      checkAbort(signal);
      if (part.type === 'file') {
        if (received || part.fieldname !== 'file') { part.file.resume(); throw new DocumentError('INVALID_FILE','文書は1件だけ選んでください。',false,400); }
        received = true;
        kind=kindFromFilename(part.filename);
        if (!kind) { part.file.resume(); throw new DocumentError('UNSUPPORTED','DOCX・XLSX・PPTXのいずれかを選んでください。古い形式とマクロ形式は対象外です。'); }
        await pipeline(part.file, createWriteStream(destination,{flags:'wx',mode:0o600}), { signal });
        if (part.file.truncated) throw new DocumentError('LIMIT_EXCEEDED','文書は10MiB以下にしてください。');
      } else {
        if (part.fieldname !== 'consent' || consent) throw new DocumentError('INVALID_FILE','未対応の送信項目が含まれています。',false,400);
        if (part.value !== 'true' || part.valueTruncated) throw new DocumentError('CONSENT_REQUIRED','文書の送信に同意してください。');
        consent = true;
      }
    }
    checkAbort(signal);
    if (!consent) throw new DocumentError('CONSENT_REQUIRED','文書の送信に同意してください。');
    if (!received || !kind) throw new DocumentError('INVALID_FILE','Office文書を選んでください。');
    return kind;
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    if (signal.aborted) checkAbort(signal);
    const code = typeof error === 'object' && error && 'code' in error ? error.code : '';
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw new DocumentError('LIMIT_EXCEEDED','文書は10MiB以下にしてください。');
    throw new DocumentError('INVALID_FILE','ファイルの送信を確認できませんでした。1件のDOCX・XLSX・PPTXを選び直してください。',false,400);
  } finally { request.raw.removeListener('data', count); }
}
