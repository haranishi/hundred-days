# Day51 registration validation

- Added the external Hakoniwa entry, screenshot, source notice, README index,
  and three-width link/image tests; preserved Day50 and unrelated worktrees.
- Verified 309,253 published places in 1,741 municipalities; actual counts replace
  the pre-exclusion count in the description, screenshot, README and tests.
- Application code and geographic data remain in the separate app repository.
- Site build and eight targeted browser tests passed (Day51 plus existing
  external apps). Private precheck passed; existing asset/third-party email
  warnings remain informational. New screenshot visually inspected and its
  PNG metadata checked: IHDR/IDAT/IEND only, attribution retained.
- App checks: typecheck, lint, 43 tests, static build and release asset checks pass.
- Japanese text reviewed with natural-japanese quick lint; factual statements
  and the short reference-style wording retained.
- PR CI, app deployment, merge and production site checks remain release gates.
