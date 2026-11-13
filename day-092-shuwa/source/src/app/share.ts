export function shareUrl(canonical: string | null | undefined, current: string): string {
  try {
    const url = new URL(canonical || current, current);
    if (!['https:', 'http:'].includes(url.protocol)) return current.split('#')[0]!;
    url.hash = '';
    return url.href;
  } catch { return current.split('#')[0]!; }
}
export function resultShareText(title: string, streak: number): string {
  return `てことばで手話の『${title}』を覚えたよ！ 🔥${streak}日連続 #てことば #手話 #100日チャレンジ`;
}
export function shareLinks(text: string, url: string) {
  return {
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
  };
}
