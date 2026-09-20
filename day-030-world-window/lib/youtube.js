const YT_HOST = 'www.youtube-nocookie.com';

export function parseYouTubeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { type: 'other', id: null };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || null;
  if (host === 'youtube.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.includes('streams')) return { type: 'other', id: null };
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
    else if (['live', 'embed'].includes(parts[0])) id = parts[1] || null;
    else if (parts[0] === 'channel' && /^UC[\w-]+$/.test(parts[1] || '')) {
      return { type: 'channel', id: parts[1] };
    }
  }
  return id ? { type: 'video', id } : { type: 'other', id: null };
}

/* autoplay は利用者の操作の後だけ（YouTubeの規約）。共有リンク（#cam=）で開いた初回は
   まだ誰も何も押していないので autoplay=0 で作り、再生は本人に始めてもらう。 */
export function embedUrl(value, { autoplay = true } = {}) {
  if (typeof value !== 'string') return null;
  const play = autoplay ? 1 : 0;
  if (value.startsWith('v:') && value.length > 2) {
    return `https://${YT_HOST}/embed/${encodeURIComponent(value.slice(2))}?autoplay=${play}&rel=0&playsinline=1`;
  }
  if (value.startsWith('c:') && value.length > 2) {
    return `https://${YT_HOST}/embed/live_stream?channel=${encodeURIComponent(value.slice(2))}&autoplay=${play}`;
  }
  return null;
}
