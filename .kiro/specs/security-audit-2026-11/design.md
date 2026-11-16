# Technical Design: `security-audit-2026-11`

## 1. Scope & Architecture Alignment
This design covers the remediation of Dependabot alert `#60` (`minimatch` / deprecated `glob` in `day-092-shuwa/source/package-lock.json`), documentation of unpatched upstream alert `#58` (`deepmerge@4.3.1`), and all trust-boundary findings confirmed during the Round 1 `security-loop` discovery on `haranishi/hundred-days`.

## 2. Design Decisions per Finding

### 2.1 Supply Chain: `day-092-shuwa/source` (`#60` & `#58`)
- **`#60` (`minimatch@10.2.6`, Moderate; deprecated `glob@11.1.0`)**:
  - Add `"overrides": { "glob": { ".": "14.0.5", "minimatch": "11.0.8" } }` in `day-092-shuwa/source/package.json`, following the pattern already established in `day-076-henkan-desk/source/package.json` and `day-079-futsu-run/source/package.json`.
  - Pre-vetted npm metadata (>= 72h publish age, non-deprecated, no `preinstall`/`install`/`postinstall` lifecycle scripts): `glob@14.0.5`, `minimatch@11.0.8`, `brace-expansion@5.0.13`, `minipass@7.1.3`, `path-scurry@3.0.0`, `@isaacs/nonrecursive-glob-match@1.1.0`.
  - Regenerate `day-092-shuwa/source/package-lock.json` via `npm install --package-lock-only --ignore-scripts`, verify `npm ci --ignore-scripts`, run `npm audit`, and verify `dist/day-092-shuwa` byte/hash parity against baseline.
- **`#58` (`deepmerge@4.3.1`, Low, `GHSA-gcqx-w48m-w2h4`)**:
  - Upstream `first_patched_version` is `null` (4.3.1 is the latest npm release). Only present in dev/build dependencies via `@rollup/plugin-node-resolve` inside Vite, never shipped into `dist/day-092-shuwa` runtime assets or exposed to untrusted input. Document accurately without fabricating a patch; surface for maintainer decision on GitHub alert dismissal.

### 2.2 `day-076-henkan-desk/source/server/documents/content.ts`: `HYPERLINK()` Global Validation
- **Root Cause**: `checkFormula` checks `if (/\bHYPERLINK\s*\(/i.test(text))` and then uses non-global `text.match(...)`, validating only the first `HYPERLINK(...)` call in a formula or defined name.
- **Design**: Iterate over every `/\bHYPERLINK\s*\(/gi` occurrence via `text.matchAll(...)`. For each occurrence, inspect the slice immediately following `(` and require `^\s*"((?:""|[^"])*)"\s*([,)])` (rejecting non-literal expressions like `HYPERLINK(A1,...)`, concatenated URLs like `HYPERLINK("https://..."&A1,...)`, and any literal target not matching `^(?:https?:\/\/|mailto:)/i`).
- **Tests**: Extend `day-076-henkan-desk/source/tests/documents/office.test.ts` (and run `createXmlCheck` directly) covering multi-call `HYPERLINK()` smuggling in `<f>` and `<definedName>`, dynamic/concatenated arguments, and safe multi-call `HYPERLINK()` controls.

### 2.3 `day-084-airpresenter/source/server.js`: Host & Origin Canonicalization
- **Root Cause**: `validateRequest(req)` resolves `new URL(req.url, 'http://' + req.headers.host)`, which allows an RFC 9112 absolute-form `req.url` targeting `127.0.0.1:<port>` to pass host/port checks while `expectedOrigin` trusts an arbitrary `req.headers.host` (`evil.attacker`).
- **Design**:
  1. Require a valid `req.headers.host` header matching an allowed host (`localhost`, `127.0.0.1`, `[::1]`, `lanIp`) and exact server port (`new URL('http://' + req.headers.host)` with empty `username`/`password`, `pathname === '/'`, matching `hostHeaderUrl.host === req.headers.host`). Return `403` `'このホスト名では接続できません。'` when host check fails (or `400` on malformed header/URL).
  2. Resolve `url = new URL(req.url, hostHeaderUrl.origin)`. Reject if `url.origin !== hostHeaderUrl.origin` (prevents absolute-form target mismatch against `Host`), then validate `req.headers.origin` strictly against `hostHeaderUrl.origin`.
  3. Rebuild `day-084-airpresenter/airpresenter-local.zip` via `python3 day-084-airpresenter/tools/package.py` so `day-084-airpresenter/tests/distribution.test.mjs` remains exact byte-for-byte in sync with `day-084-airpresenter/source/`.
- **Tests**: Add regression assertions in `day-084-airpresenter/source/tests/server.test.cjs` for absolute-form request URIs with spoofed `Host` + `Origin`.

### 2.4 `day-035-front-page/lib/target.js` & `functions/api/day-035/page.js`: SSRF & Meta URL Hardening
- **Root Cause**:
  - `validateTarget` permits explicit arbitrary ports (`:6379`, `:8080`), omits reserved TLDs (`.arpa`, `.corp`, `.example`, `.test`, `.invalid`, `.intranet`, `.private`), and omits self-hosts (`hundred-days.pages.dev`, `rairakku.com`).
  - `extractMeta` validates `<link rel="canonical">` and `og:image`/`twitter:image` only with `absolute()` (`http:`/`https:`), allowing `user:pass@`, custom ports, private/loopback/metadata IPs, and `http:` images (blocked by Day 35 `img-src https:` CSP) to be returned and even letting untrusted `canonical` hijack relative image resolution.
- **Design**:
  - Align `day-035-front-page/lib/target.js` `validateTarget` with `day-074-link-dokumi/lib/target-guard.js`: reject non-empty `url.port`, expand `RESERVED_NAME` to include `arpa|corp|example|test|invalid|intranet|private`, and block `SELF_HOSTS` (`hundred-days.pages.dev`, `rairakku.com`, and subdomains). Retain `http:` and `https:` page targets (`target.test.mjs` tests `http://example.com/`).
  - In `functions/api/day-035/page.js` `extractMeta`: resolve `canonical` relative to `baseUrl`, then validate through `validateTarget(...)` (`?.href ?? null`). Resolve `image` relative to `(canonical || baseUrl)` and validate through `validateTarget(...)`, additionally requiring `protocol === 'https:'` per Day 35 CSP (`img-src 'self' https:`).
- **Tests**: Add regression cases in `day-035-front-page/tests/target.test.mjs` and `day-035-front-page/tests/page-relay.test.mjs`.

### 2.5 `functions/api/day-023/trend.js`: Entity Bounds & OpenSearch URL Validation + Client DOM Guards
- **`decodeHtml` bounds (`functions/api/day-023/trend.js`)**: Guard decimal/hex character references with `Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)`, returning `whole` unchanged when out of bounds instead of throwing `RangeError`.
- **External URL scheme enforcement before DOM sinks**:
  - Extract/use pure URL guard helpers allowing only `https:`/`http:` (or `https:` where CSP restricts to `https:`):
    - `functions/api/day-023/trend.js` (`parseOpenSearchRecords`): validate `link` URL scheme (`http:`/`https:` via `URL`), returning `""` on non-http(s) URLs; guard `day-023-magtrace/app.js` before assigning `link.href` (omit/disable `href` if unsafe).
    - `day-031-shape-where/lib/wiki.js` (`pickFields`): sanitize `url` (`https:`/`http:` via `URL` helper -> `""` on invalid schemes) + guard `day-031-shape-where/app.js` before setting `ui.wikiLink.href`.
    - `functions/api/day-030/windy.js` (`trimDetail`): validate `image`, `imageDaylight`, `player.{day,month,year,lifetime}`, and `detailUrl` with `https:` `URL` helper (returning `null` on invalid/non-https URLs, matching `day-030` `img-src https:` CSP) + guard `day-030-world-window/lib/ui.js` (`renderWindy` & `externalLink`).
    - `day-013-gov-answers/lib/gov.js` + `day-013-gov-answers/app.js`: export `safeSpeechUrl` (`https:`/`http:` only) and only assign `<a href>` when valid (with `rel = 'noopener noreferrer'`).
- **Tests**: Add unit tests in `day-023-magtrace/tests/parse.test.mjs`, `day-031-shape-where/tests/wiki.test.mjs`, `day-030-world-window/tests/proxy-windy.test.mjs`, and `day-013-gov-answers/tests/gov.test.mjs`.

### 2.6 `scripts/lib/dist-files.mjs`: Static Build Artifact Hygiene
- **Root Cause**: `isServedPath` uses a narrow denylist, copying `package.json`, `package-lock.json`, `.gitignore` dotfiles, top-level dev `scripts/` (including inline-script HTML helpers), unlisted top-level `tools/`, and static subdirectory `_headers` files into `dist/`.
- **Design**:
  - Update `isServedPath(dir, relativePath)` in `scripts/lib/dist-files.mjs` to exclude:
    - Any path containing dot-prefixed segments (`seg.length > 0 && seg.startsWith('.')`).
    - Any file whose basename is `package.json`, `package-lock.json`, or `_headers` (note: `scripts/build.mjs` still writes `dist/day-084-airpresenter/_headers` *after* `cpSync` for Worker packaging, keeping `day084-browser-build.test.mjs` intact).
    - Top-level `tools` and `scripts` directories across all Days alongside `SOURCE_DIRS_BY_APP[dir]` (preserving nested `assets/tools/...`, `day-073-offbeat/src/app.js`, and `day-084-airpresenter/airpresenter-local.zip`).
  - Keep Pages `dist/_headers` Day 84 (`frame-ancestors 'none'`) and Day 55 (`/*` inherited `Permissions-Policy`) intact, as those are covered by explicit architectural design (Day 84 Pages redirects to dedicated Worker) and `tests/e2e/security-headers.spec.mjs` contracts.
- **Tests**: Update `scripts/tests/dist-files.test.mjs` to lock down the new exclusions while preserving `assets/tools/og.png` and `lib/toolbox.js` positive cases.
