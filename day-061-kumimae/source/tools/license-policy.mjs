import { createHash } from 'node:crypto'

// Audited browser distribution policy. New packages/helpers stop the build until reviewed.
const policies = new Map([
  ['@babel/runtime', { files: ['LICENSE'], scope: 'Babel helpers used by the browser modules.' }],
  ['@react-three/drei', { files: ['LICENSE'], scope: 'React Three Fiber browser helpers retained by the production bundle.' }],
  ['@react-three/fiber', { files: [], scope: 'React renderer for Three.js. Embedded React reconciler notices are retained below; its MIT permission is also included with React.' }],
  ['its-fine', { files: ['LICENSE'], scope: 'React context bridge used by the Three.js renderer.' }],
  ['react', { files: ['LICENSE'], scope: 'React browser and JSX runtimes; MIT permission for React code embedded in React Three Fiber.' }],
  ['react-dom', { files: ['LICENSE'], scope: 'React DOM browser rendering runtime.' }],
  ['react-use-measure', { files: ['LICENSE'], scope: 'Browser element measurement hook.' }],
  ['scheduler', { files: ['LICENSE'], scope: 'React scheduling runtime.' }],
  ['suspend-react', { files: ['LICENSE'], scope: 'React suspense cache used by the renderer.' }],
  ['three', { files: ['LICENSE'], scope: 'Three.js renderer and retained example utilities. Three.js author permission also covers Three.js-derived code in three-stdlib.' }],
  ['three-stdlib', { files: ['LICENSE'], scope: 'Retained Three.js example utilities and Poimandres modifications; Three.js permission is included separately.' }],
  ['use-sync-external-store', { files: ['LICENSE'], scope: 'React external-store subscription helpers.' }],
  ['zustand', { files: ['LICENSE'], scope: 'Browser state stores and React bindings.' }],
  ['vite', { files: ['LICENSE.md'], scope: 'Only the modulepreload and dynamic-import preload browser helpers; the build server is not distributed.' }],
  ['rolldown', { files: ['LICENSE', 'THIRD-PARTY-LICENSE'], scope: 'Generated browser module interop runtime, with upstream Rollup/esbuild notices retained. Build tools are not shipped.' }],
])

export const virtualOwners = new Map([
  ['\0vite/modulepreload-polyfill.js', 'vite'],
  ['\0vite/preload-helper.js', 'vite'],
  ['\0rolldown/runtime.js', 'rolldown'],
])

// The 9.8.0 npm archive omits LICENSE. The official v9.8.0 tag and package
// metadata were checked at this immutable commit; builds use this vendored text offline.
export const fiberLicense = {
  version: '9.8.0',
  file: 'tools/licenses/react-three-fiber-9.8.0.LICENSE.txt',
  source: 'https://raw.githubusercontent.com/pmndrs/react-three-fiber/7db6056f80f11db3ba97038429eb935514f8b4d1/LICENSE',
  packageMetadata: 'https://raw.githubusercontent.com/pmndrs/react-three-fiber/7db6056f80f11db3ba97038429eb935514f8b4d1/packages/fiber/package.json',
  sha256: '9c35b5de7b7493a707fffe4eb23bd2f7f449153c1911f7c6eefb4e591fd5349a',
}

export function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export const sha256 = (content) => createHash('sha256').update(content).digest('hex')

export function policyFor(name) {
  const policy = policies.get(name)
  invariant(policy, `Unreviewed distributed package: ${name}. Review its actual license before distribution.`)
  return policy
}

export function validatePackageMetadata(pkg, locked, expectedName) {
  policyFor(expectedName)
  invariant(pkg.name === expectedName, `Package identity mismatch: ${expectedName}.`)
  invariant(typeof pkg.version === 'string' && pkg.version, `Missing installed version: ${expectedName}.`)
  invariant(locked?.version === pkg.version, `Installed/lock version mismatch: ${expectedName}.`)
  invariant(pkg.license === 'MIT' && locked.license === 'MIT', `Unknown or changed license: ${expectedName}.`)
  invariant(typeof locked.integrity === 'string' && locked.integrity.startsWith('sha512-'), `Missing locked archive integrity: ${expectedName}.`)
  if (expectedName === '@react-three/fiber') invariant(pkg.version === fiberLicense.version, 'React Three Fiber version changed. Review the missing upstream license again.')
}

export function validateMitText(text, source) {
  const flattened = text.replace(/\s+/g, ' ')
  invariant(/\bMIT licen[cs]e\b/i.test(flattened), `Missing MIT license title: ${source}.`)
  invariant(/^Copyright\s+.+\S/im.test(text), `Missing copyright notice: ${source}.`)
  invariant(/Permission is hereby granted,[\s\S]*?without restriction/i.test(flattened), `Missing permission grant: ${source}.`)
  invariant(/The above copyright notice and this permission notice shall be included/.test(flattened), `Missing notice-retention condition: ${source}.`)
  invariant(/THE SOFTWARE IS PROVIDED "AS IS"/.test(flattened), `Missing warranty disclaimer: ${source}.`)
  invariant(/OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN (?:THE )?SOFTWARE\./.test(flattened), `Truncated MIT license: ${source}.`)
  return text
}

export function viteCoreLicense(text) {
  const offset = text.indexOf('\n# Licenses of bundled dependencies\n')
  invariant(text.startsWith('# Vite core license\n') && offset > 0, 'Vite LICENSE.md structure changed; re-review browser helper licensing.')
  return text.slice(0, offset)
}

export function embeddedNotices(source) {
  return [...source.matchAll(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\n]*(?:\n[ \t]*\/\/[^\n]*)*/gm)]
    .map((match) => match[0])
    .filter((comment) => /@license|copyright|\bMIT\b|\blicense(?:d)?\b|SPDX-/i.test(comment))
}

export function validateEmbeddedNotices(notices, source) {
  invariant(notices.every((notice) => !/\b(?:AGPL|LGPL|GPL|Apache|BSD|ISC|MPL|CC0|Unlicense|Zlib)\b/i.test(notice)), `Additional source license terms need review: ${source}.`)
}
