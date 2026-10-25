import { parentPort, workerData } from 'node:worker_threads';
import { validateArchive } from './archive.js';
import { DocumentError } from './errors.js';
import type { OfficeKind } from './formats.js';
const {path,expected}=workerData as {path:string;expected?:OfficeKind};
validateArchive(path,expected).then(kind=>parentPort?.postMessage({ok:true,kind})).catch((error:unknown)=>parentPort?.postMessage({ok:false,code:error instanceof DocumentError?error.code:'INVALID_FILE',message:error instanceof DocumentError?error.message:'文書の構造を読み取れません。Officeで保存し直してください。'}));
