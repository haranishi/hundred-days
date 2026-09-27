# Day51 Hakoniwa registration

## Scope

Publish Hakoniwa as Day51 using the existing external-app registration.
The source and nationwide data stay in haranishi/hakoniwa-map; the app stays at
its existing Workers URL. This avoids duplicating the Next.js build and catalog.
The user requested a PR and publication, following the request to merge.

## Boundaries

- Change only Day51 metadata, its screenshot, rights notice, README index,
  and the relevant tests and task records.
- Preserve Day50 artwork and all unrelated worktrees.
- Do not publish private settings, development cache, or social posts.
- No new paid service or account configuration.

## Acceptance

- Day51 appears once and links to the live nationwide app in a new tab.
- The screenshot retains map attribution and has no personal information.
- Statistics, authorship statements, dates, and URLs match the actual work.
- Private precheck, site build, targeted browser tests, PR CI, and live app
  checks pass. Verify automatic site deployment after merge.
- Keep the existing external entries and published apps working.
- Maximum three improvement rounds; return repeated unresolved failures.
