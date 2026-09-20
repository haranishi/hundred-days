import { embedUrl } from './youtube.js';

export function bustCache(url, now = Date.now()) {
  return `${url}${String(url).includes('?') ? '&' : '?'}_=${now}`;
}

export function viewerFor(camera, { canPlayHls = false, autoplay = true } = {}) {
  if (camera?.kind === 'yt') return { mode: 'youtube', src: embedUrl(camera.url, { autoplay }) };
  if (camera?.kind === 'img') return { mode: 'image', src: camera.url };
  if (camera?.kind === 'hls' && canPlayHls) return { mode: 'hls', src: camera.url };
  return { mode: 'link', src: camera?.url || null };
}
