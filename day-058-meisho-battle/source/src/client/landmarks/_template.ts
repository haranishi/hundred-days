// Copy to <catalog-id>.ts; replace all placeholders with researched identity.
// Register metadata in research/expansion-*.json and run import-expansion.mjs.
// Never register a generic box under a real landmark name.
import type { Kit } from './kit'
export function build(kit: Kit): void {
  kit.stage(1) // landscape / massing
  kit.stage(2) // characteristic silhouette
  kit.stage(3) // distinguishing detail, visible before colour reveal
  kit.stage(4) // minimal surrounding context
}
