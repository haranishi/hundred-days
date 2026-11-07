const PDF_ROOT = new URL('vendor/pdfjs/', import.meta.url);
const MAX_INPUT = 25 * 1024 * 1024;
const MAX_PAGES = 100;
const MAX_EDGE = 1920;
const MAX_OUTPUT = 120 * 1024 * 1024;
const MAX_THUMBNAIL = 20 * 1024;
function fault(status, message) {return Object.assign(new Error(message), {status});}
function checkAbort(signal) {if (signal?.aborted) throw new DOMException('資料の読込を取り消しました。', 'AbortError');}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(fault(422,'ページ画像を作成できませんでした。別のPDFを選んでください。')),type,quality));
}

/** Render a local File, sequentially on one canvas. No document URL enters fetch. */
export async function importPdf(file, {signal, onProgress = () => {}, maxInputBytes = MAX_INPUT} = {}) {
  checkAbort(signal);
  if (!(file instanceof Blob)) throw fault(400, 'PDFファイルを選んでください。');
  if (!/\.pdf$/i.test(file.name || '')) throw fault(415, 'PDF形式の資料を選んでください。');
  if (file.size > Math.min(64*1024*1024,maxInputBytes)) throw fault(413, '25 MiB以下のPDFを選んでください。');
  if (!file.size) throw fault(422, '空のPDFは読み込めません。別のPDFを選んでください。');
  const pages = [], canvas = document.createElement('canvas');
  let loadingTask, renderTask, destroyPromise, password = false, bytes = 0;
  const destroy = () => {if (loadingTask) destroyPromise ||= loadingTask.destroy(); return destroyPromise;};
  const abort = () => {renderTask?.cancel(); void destroy()?.catch(() => {});};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    onProgress({stage:'preparing',completed:0,total:null});
    const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs'); checkAbort(signal);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs',PDF_ROOT).href;
    const data = new Uint8Array(await file.arrayBuffer()); checkAbort(signal);
    loadingTask = pdfjs.getDocument({data,cMapUrl:new URL('cmaps/',PDF_ROOT).href,cMapPacked:true,
      standardFontDataUrl:new URL('standard_fonts/',PDF_ROOT).href,wasmUrl:new URL('wasm/',PDF_ROOT).href,iccUrl:new URL('iccs/',PDF_ROOT).href,
      disableWorkerRendering:true,enableXfa:false,stopAtErrors:true,verbosity:0});
    loadingTask.onPassword = () => {password = true; void destroy()?.catch(() => {});};
    const documentProxy = await loadingTask.promise; checkAbort(signal);
    const total = documentProxy.numPages;
    if (!Number.isInteger(total) || total < 1) throw fault(422, 'ページのあるPDFを選んでください。');
    if (total > MAX_PAGES) throw fault(413, '100ページ以下のPDFを選んでください。');
    onProgress({stage:'rendering',completed:0,total});
    for (let index = 0; index < total; index++) {
      checkAbort(signal);
      const page = await documentProxy.getPage(index + 1); checkAbort(signal);
      const original = page.getViewport({scale:1});
      if (![original.width,original.height].every(value => Number.isFinite(value) && value > 0)) throw fault(422,'ページの大きさを確認できませんでした。');
      const viewport = page.getViewport({scale:MAX_EDGE/Math.max(original.width,original.height)});
      canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
      renderTask = page.render({canvas,viewport}); await renderTask.promise; renderTask = null; checkAbort(signal);
      const png = await canvasBlob(canvas,'image/png'); checkAbort(signal);
      bytes += png.size;
      if (bytes > MAX_OUTPUT) throw fault(413,'ページ画像の合計が120 MiBを超えました。PDFを分けるか、画像を軽くして選び直してください。');
      pages.push(png); page.cleanup();
      onProgress({stage:'rendering',completed:index+1,total}); checkAbort(signal);
    }
    onProgress({stage:'finalizing',completed:total,total});
    const deckId = [...crypto.getRandomValues(new Uint8Array(12))].map(n => n.toString(16).padStart(2,'0')).join('');
    return {id:deckId,total,pages,dispose(){pages.length = 0;}};
  } catch (error) {
    pages.length = 0;
    if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('資料の読込を取り消しました。', 'AbortError');
    if (error?.status) throw error;
    throw fault(422, password ? 'パスワードを解除したPDFを選んでください。' : 'PDFを読み込めませんでした。元のアプリからPDFに書き出し直して選んでください。');
  } finally {
    signal?.removeEventListener('abort',abort); renderTask?.cancel();
    try {await destroy();} catch { /* Rendering errors retain their actionable message. */ }
    canvas.width = canvas.height = 0;
  }
}

/** The wire budget can further shrink JPEGs when JSON escaping makes a note larger. */
export async function createThumbnail(png, {maxBytes = MAX_THUMBNAIL} = {}) {
  const limit = Math.min(MAX_THUMBNAIL,maxBytes);
  if (!Number.isFinite(limit) || limit < 1024) throw fault(413,'通信する内容が大きすぎます。カンペを短くしてください。');
  const bitmap = await createImageBitmap(png), canvas = document.createElement('canvas');
  try {
    for (let edge = 480; edge >= 48; edge = Math.floor(edge * 0.75)) {
      const scale = Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
      canvas.width = Math.max(1,Math.floor(bitmap.width*scale)); canvas.height = Math.max(1,Math.floor(bitmap.height*scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [0.72,0.52,0.34,0.18]) {
        const jpeg = await canvasBlob(canvas,'image/jpeg',quality);
        if (jpeg.size <= limit) return jpeg;
      }
    }
    throw fault(413,'ページのプレビュー画像を小さくできませんでした。');
  } finally {bitmap.close(); canvas.width = canvas.height = 0;}
}
