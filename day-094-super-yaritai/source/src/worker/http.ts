// Worker の応答に付ける見出しと、JSON の返し方。静的配信の見出しは public/_headers（中身を同じにする。単体試験で確かめる）。
import { WORKER_ORIGIN } from '../shared/hosts'

/**
 * Pages からのネット対戦に必要な Worker だけへ、別 origin の通信を許す（public/_headers と同じ）。
 * 'wasm-unsafe-eval' は物理エンジン Rapier（WebAssembly）のため。eval は許さない
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  `font-src 'self'; connect-src 'self' ${WORKER_ORIGIN} ${WORKER_ORIGIN.replace('https:', 'wss:')}; media-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'; ` +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers },
  })
}
