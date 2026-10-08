import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invariant, policyFor, sha256 } from './license-policy.mjs'

export const RELEASE_ENTRIES = ['index.html', 'assets', 'legal', 'favicon.svg', 'og.png']
const LEGAL_FILES = ['THIRD_PARTY_MANIFEST.json', 'THIRD_PARTY_NOTICES.txt', 'data-and-rights.html']
const SHARED_ASSETS = new Set(['/shared/share.js', '/shared/share.css'])
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.svg', '.txt', '.json'])
const slash = (path) => path.replaceAll('\\', '/')
const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', 'shared')

function filesIn(root, current = root) {
  const files = []
  for (const name of readdirSync(current).sort()) {
    const filename = join(current, name)
    const stat = lstatSync(filename)
    invariant(!stat.isSymbolicLink(), `Symbolic link is not a release artifact: ${slash(relative(root, filename))}`)
    if (stat.isDirectory()) files.push(...filesIn(root, filename))
    else {
      invariant(stat.isFile(), 'Non-file object in distribution.')
      files.push(slash(relative(root, filename)))
    }
  }
  return files
}

export function validateContent(content, file) {
  invariant(!/(?:\/Users\/|\/home\/|[A-Z]:[\\/]Users[\\/]|file:\/\/)/i.test(content), `Private filesystem path in ${file}.`)
  invariant(!/\.(?:glb|gltf)(?:["'`?\s)]|$)|reference-photos\//i.test(content), `External model/photo reference in ${file}.`)
  const rooted = [...content.matchAll(/["'`(](\/(?:(?:assets|models|legal)\/|favicon\.svg|og\.png)[^"'`)]*)/g)]
  invariant(rooted.length === 0, `Root-relative application asset URL in ${file}.`)
  if (file.endsWith('.css')) invariant(!/url\(\s*["']?\//i.test(content), `Root-relative CSS resource in ${file}.`)
  if (file.endsWith('.html')) {
    for (const match of content.matchAll(/\b(src|href|poster)=["'](\/[^"']*)["']/g)) {
      if (SHARED_ASSETS.has(match[2])) continue
      invariant(match[1] === 'href' && !/\.[a-z0-9]+(?:[?#]|$)/i.test(match[2]), `Root-relative resource URL in ${file}.`)
    }
    invariant(!/http-equiv=["']Content-Security-Policy|ws:\/\//i.test(content), `Development/CSP override in ${file}.`)
  }
  if (file.endsWith('.js')) {
    invariant(!/https?:\/\/(?:www\.)?kakaku\.com|tomshardware\.com|pcgamer\.com|3dmark\.com|benchmarks\.json|timeSpy|cinebench|gamingIndex/i.test(content), `Unapproved price/benchmark data in ${file}.`)
    invariant(!/sourceMappingURL=|VITE_TEST_HOOK|__KUMIMAE_TEST__/i.test(content), `Development artifact in ${file}.`)
  }
}

export function checkDistribution(dist) {
  invariant(existsSync(join(dist, 'index.html')), 'Missing dist/index.html. Run npm run build first.')
  const top = readdirSync(dist).sort()
  invariant(top.every((file) => RELEASE_ENTRIES.includes(file) || file === 'shared'), 'Unknown top-level release artifact.')
  for (const required of ['index.html', 'assets', 'legal', 'favicon.svg']) invariant(top.includes(required), `Missing release artifact: ${required}.`)
  const allFiles = filesIn(dist)
  const sharedFiles = allFiles.filter((file) => file.startsWith('shared/'))
  if (top.includes('shared')) {
    invariant(sharedFiles.join() === 'shared/share.css,shared/share.js', 'Unknown file in shared site controls.')
    for (const file of sharedFiles) invariant(sha256(readFileSync(join(dist, file))) === sha256(readFileSync(join(sharedRoot, file.slice(7)))), 'Shared controls differ from the 100days source.')
  }
  // npm shared:sync owns parent/shared; release must never replace it.
  const files = allFiles.filter((file) => !file.startsWith('shared/'))
  const legal = files.filter((file) => file.startsWith('legal/')).map((file) => file.slice(6)).sort()
  invariant(legal.join() === [...LEGAL_FILES].sort().join(), 'Unknown or missing legal document in distribution.')
  const assets = files.filter((file) => file.startsWith('assets/'))
  invariant(assets.some((file) => file.endsWith('.js')), 'No browser JavaScript in assets/.')
  invariant(assets.every((file) => /^assets\/[A-Za-z0-9_.-]+\.(?:js|css|js\.LICENSE\.txt)$/.test(file)), 'Unknown asset type; only generated JavaScript, CSS and code notices may be released.')
  for (const file of files) {
    invariant(!/\.(?:glb|gltf|map|hdr|exr|zip|blend)$/i.test(file), `Prohibited release artifact: ${file}.`)
    if (TEXT_EXTENSIONS.has(extname(file))) validateContent(readFileSync(join(dist, file), 'utf8'), file)
  }

  const manifest = JSON.parse(readFileSync(join(dist, 'legal/THIRD_PARTY_MANIFEST.json'), 'utf8'))
  invariant(manifest.schemaVersion === 1 && Array.isArray(manifest.packages) && manifest.packages.length > 0, 'Invalid third-party manifest.')
  invariant(sha256(readFileSync(join(dist, 'legal/THIRD_PARTY_NOTICES.txt'))) === manifest.noticeSha256, 'Third-party notice hash mismatch.')
  for (const pkg of manifest.packages) {
    policyFor(pkg.name)
    invariant(pkg.license === 'MIT' && pkg.version && pkg.licenses?.length, `Incomplete third-party notice: ${pkg.name}.`)
  }
  invariant(Array.isArray(manifest.generatedFiles) && manifest.generatedFiles.length > 0, 'Missing browser graph output hashes.')
  const generated = new Set()
  for (const item of manifest.generatedFiles) {
    invariant(item.file === 'index.html' || assets.includes(item.file), 'Manifest contains an unexpected generated file.')
    invariant(!generated.has(item.file), 'Duplicate browser graph output in manifest.')
    generated.add(item.file)
    invariant(existsSync(join(dist, item.file)), `Missing generated file: ${item.file}.`)
    invariant(sha256(readFileSync(join(dist, item.file))) === item.sha256, `Browser graph/output mismatch: ${item.file}. Run a fresh production build.`)
  }
  invariant(generated.has('index.html') && assets.every((file) => generated.has(file)), 'An emitted browser asset is outside the notice audit.')

  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const linked = [...html.matchAll(/\b(?:src|href)=["'](?:\.\/)?(assets\/[^"']+)["']/g)].map((match) => match[1])
  invariant(linked.some((file) => file.endsWith('.js')), 'index.html does not reference an application entry script.')
  for (const file of linked) invariant(assets.includes(file), `HTML references a missing asset: ${file}.`)
  return { files, assets, packages: manifest.packages.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] || 'dist')
    const result = checkDistribution(dist)
    console.log(`Release artifacts checked: ${result.files.length} files; ${result.packages} third-party packages.`)
  } catch (error) { console.error(`Release validation failed: ${error.message}`); process.exitCode = 1 }
}
