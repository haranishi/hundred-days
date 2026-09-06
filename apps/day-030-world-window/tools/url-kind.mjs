const IMAGE_EXTENSIONS = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const HLS_EXTENSIONS = /\.m3u8(?:$|[?#])/i;

export function classifyUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return { kind: 'invalid', https: false, url };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { kind: 'invalid', https: false, url };
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const kind = host === 'youtube.com' || host === 'youtu.be'
    ? 'youtube'
    : HLS_EXTENSIONS.test(parsed.pathname)
      ? 'm3u8'
      : IMAGE_EXTENSIONS.test(parsed.pathname)
        ? 'image-ext'
        : 'other';
  return { kind, https: parsed.protocol === 'https:', url: parsed.href };
}

export function upgradeToHttps(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.href;
  } catch {
    return url;
  }
}

export function kindFromContentType(contentType, url) {
  const type = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (type.startsWith('image/')) return 'img';
  if (type.startsWith('video/') || ['application/vnd.apple.mpegurl', 'application/x-mpegurl'].includes(type)) {
    return classifyUrl(url).https ? 'hls' : 'page';
  }
  return 'page';
}

export function readExcludeHosts(text) {
  return new Set(String(text).split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter(Boolean));
}

export function isExcluded(url, hostsSet) {
  let hostname;
  try {
    hostname = new URL(String(url)).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return [...hostsSet].some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
