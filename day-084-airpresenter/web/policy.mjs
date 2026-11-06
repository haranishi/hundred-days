export const APP_PATH = '/100days/day-084-airpresenter';
export const OFFICE_PATH = APP_PATH + '/office';
export const ENGINE_ASSET_PATH = APP_PATH + '/vendor/office';
export const OFFICE_ASSET_VERSION = 'zetaoffice-24.2.8.0.beta1-zetajs-1.2.0-noto-f8d15753';
export const OFFICE_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'"
].join('; ');
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "connect-src 'self' wss://rairakku.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ');
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self), magnetometer=(self)';
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};
