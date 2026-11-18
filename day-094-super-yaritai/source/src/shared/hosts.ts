// 画面と Worker が別の住所でも、接続先と許可リストが食い違わないように共用する。
export const WORKER_ORIGIN = 'https://super-yaritai.haranishi.workers.dev'
export const APP_ORIGINS = ['https://day94.rairakku.com', 'https://super-yaritai-day94.pages.dev'] as const

export function isAppOrigin(origin: string): boolean {
  return APP_ORIGINS.some((allowed) => allowed === origin)
}

// 別ポートの試験用に限って許可を広げるため、公開ホストと区別する。
export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}
