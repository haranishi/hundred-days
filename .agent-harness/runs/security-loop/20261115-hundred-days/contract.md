# Security-Loop Run Contract: 20261115-hundred-days

- **run_id**: `20261115-hundred-days`
- **mode**: `fix` (starts in audit + transitions to minimal targeted fix for confirmed findings)
- **branch**: `fix/security-audit-2026-11-15` (from `origin/main` commit `a34bfbce954855978ea2b2a61c7fd6330dfb9569`)
- **max_rounds**: `3` (stop early if no remaining actionable findings or after 2 identical remediation failures on a finding)
- **source.before**:
  - `ref`: `a34bfbce954855978ea2b2a61c7fd6330dfb9569`
  - `manifest`: `.agent-harness/runs/security-loop/20261115-hundred-days/manifest.before.sha256`
  - `tree_sha256`: `a3ef4e5d33ff594253767b5b5977ed4489b98f59c0a0515998916d381d7db505`

## Scope Paths
- `functions` (Cloudflare Pages Functions & `_middleware.js`)
- `infra` (Cloudflare Workers: `infra/day-redirect`)
- `scripts` (build, CSP/headers, precheck, dependency audit, serve/publish tooling, home/intro scripts)
- `shared` (shared client modules)
- `static` (`_redirects`, `privacy.html`, verification files)
- `.github` (GitHub Actions workflows)
- `day-*` (all 92 Day apps and included sources/servers/workers/packages)
- `package.json`, `package-lock.json`, `playwright.config.ts`

## Out of Scope
- `node_modules`, `dist`, `.wrangler`, `.cache`, `day-*/tools/cache`
- `.agent-harness/` run logs/artifacts and `.kiro/` spec documents (excluded from code snapshot hash so documentation updates do not perturb code hashes)
- Live remote Cloudflare / production third-party APIs outside sandbox (reproduction uses local unit harnesses, mocked fetch/DNS/env bindings, or local HTTP/URL inputs).

## Trust Boundaries & Acceptance Criteria
1. **HTTP / Worker / Pages Edge Boundaries** (`functions/`, `infra/day-redirect/`, `day-084-airpresenter/web/`, `day-084-airpresenter/source/`, `day-076-henkan-desk/source/server/`):
   - Unauthenticated / cross-origin / forged header requests must respect Origin, Sec-Fetch-Site, method, size, rate, and secret checks.
   - Redirects (`infra/day-redirect`, `functions/api/*`, `static/_redirects`) must reject protocol-relative (`//`), backslash (`\`), control chars, or open redirects to external origins.
   - SSRF / DNS / IP guards (`day-035`, `day-074`, `day-023`, `day-025`, `day-029`, `day-030`, `day-009`, `day-044`) must reject private/loopback/link-local/CGNAT/ULA/IPv4-mapped IPv6/non-canonical IP representations and enforce response byte/time/hop limits.
   - Server file uploads/archives (`day-076-henkan-desk`, `day-084-airpresenter`) must prevent zip-slip/path traversal, symlink escape, zip bombs, and unsafe child-process/argument injection.
2. **Client / DOM / Storage / PostMessage / XSS Boundaries** (`day-*`, `shared/`, `scripts/site/`, `scripts/build.mjs`):
   - Untrusted query/hash parameters, API responses, uploaded files (`.md`, `.csv`, `.json`, `.html`, `.pptx`), `postMessage` events, and `localStorage` data must not execute arbitrary script/HTML (`innerHTML`/`outerHTML`/`insertAdjacentHTML`/`javascript:` URLs), overwrite `Object.prototype` (`__proto__`/`constructor`/`prototype`), or leak secrets/tokens.
3. **Headers / CSP / Build / Distribution / CI Boundaries** (`scripts/build.mjs`, `scripts/lib/`, `scripts/audit-dependencies.mjs`, `scripts/precheck.mjs`, `.github/workflows/`):
   - No unintended `.env`, `package*.json`/lockfiles, `.git`, `.kiro`, `.agent-harness`, source maps, or private secrets shipped into `dist/`.
   - Strict CSP / Permissions-Policy / X-Content-Type-Options / Referrer-Policy across root and Day pages; no unsafe GitHub Actions expression injection (`github.event.*` in `run:`) or excessive token permissions.
4. **Dependency Supply Chain** (tracked alongside `.kiro/specs/dev-deps-security-2026-10/followup-2026-11-15.md`):
   - Resolve fixable open Dependabot alerts (`#60` `minimatch` + transitive `glob`) cleanly without breaking callers or introducing unvetted versions (`>=3 days` age, no install scripts).

## Verification Rules
- Attackers must not edit repository files.
- Defenders only touch confirmed findings.
- Independent Verifier must run in a fresh conversation, verify identical `probe_sha256` against the fixed `tree_sha256`, verify positive controls + distinct variant probes, and run normal repository tests without relaxed assertions.
- No personal paths, secrets, or sensitive credentials may appear in `.agent-harness` or `.kiro` artifacts.
