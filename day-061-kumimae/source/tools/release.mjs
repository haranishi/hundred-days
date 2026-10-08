import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDistribution, RELEASE_ENTRIES } from './check-release.mjs'
import { invariant, sha256 } from './license-policy.mjs'
import { sourceHash } from './source-hash.mjs'

const source = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(source, 'dist')
const day = join(source, '..')

// Validate the entire allowlist and graph before replacing any managed artifact.
// README/meta/shared/tests/screenshots/demo/source belong to the site and are untouched.
const result = checkDistribution(dist)
for (const entry of RELEASE_ENTRIES) {
  if (!existsSync(join(dist, entry))) continue
  if (entry === 'assets' || entry === 'legal') rmSync(join(day, entry), { recursive: true, force: true })
  cpSync(join(dist, entry), join(day, entry), { recursive: true })
}
for (const file of result.files) invariant(sha256(readFileSync(join(day, file))) === sha256(readFileSync(join(dist, file))), `Release copy differs: ${file}.`)
writeFileSync(join(source, 'build-record.json'), JSON.stringify(sourceHash(source), null, 2) + '\n')
console.log(`Released ${result.files.length} checked files into day-061-kumimae/ (${result.packages} third-party packages).`)
