/**
 * MediaPipe Tasks は、手の読み取りとは別に、利用状況の数値を Google（odml.pa.googleapis.com）へ
 * fetch で送る仕組みを持つ（公式 README の Privacy Notice・2026-06-05 版）。止める公式のスイッチは無い。
 * このアプリは「端末の外へ何も送らない」と約束するので、その住所への fetch だけを、送らずに失敗として返す。
 * 失敗を受けた MediaPipe の記録係は、以後の送信を止める（定期送信のタイマーを解除する）。
 * 公開先では CSP（connect-src 'self'）でも止まる。二重に止めるのは、CSP の無い環境（開発・別の置き場所）でも送らないため。
 */
const BLOCKED = /^https:\/\/[^/]*\.googleapis\.com\/v1\/log/;
let installed = false;

export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isTelemetryUrl(url: string): boolean {
  return BLOCKED.test(url);
}

export function blockMediapipeTelemetry(target: { fetch: typeof fetch } = globalThis): void {
  if (installed && target === globalThis) return;
  const original = target.fetch.bind(target);
  target.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (isTelemetryUrl(urlOf(input))) return Promise.resolve(new Response(null, { status: 204, statusText: 'blocked by tekotoba' }));
    return original(input, init);
  }) as typeof fetch;
  if (target === globalThis) installed = true;
}
