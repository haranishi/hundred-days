import type { Artifact } from '../shared/contracts';
const urls = new Set<string>();
export function safeFilename(name: string, mime: string): string {
  const ext: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf', 'application/zip': '.zip', 'application/json': '.json', 'text/csv': '.csv', 'text/tab-separated-values': '.tsv', 'application/yaml': '.yaml', 'text/yaml': '.yaml', 'text/html': '.html', 'text/plain': '.txt', 'text/markdown': '.md' };
  const base = name.split(/[\/]/).pop()?.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^\.+|[. ]+$/g, '').trim().slice(0, 110) || 'converted';
  return base + (ext[mime.split(';')[0]!.trim().toLowerCase()] ?? '.bin');
}
export function saveArtifact(artifact: Artifact): 'started' | 'failed' {
  try {
    const url = URL.createObjectURL(artifact.blob); urls.add(url);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeFilename(artifact.filename, artifact.mime);
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 30_000);
    return 'started';
  } catch { return 'failed'; }
}
export function releaseDownloadURLs() { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
