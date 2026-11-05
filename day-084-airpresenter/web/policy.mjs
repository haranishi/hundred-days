export const APP_PATH = '/100days/day-084-airpresenter';
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
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), accelerometer=(self), gyroscope=(self), magnetometer=(self)';
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin'
};
