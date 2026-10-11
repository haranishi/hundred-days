import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = process.env.CARGO || join(homedir(), '.cargo/bin/cargo');
const target = resolve(root, process.env.CARGO_TARGET_DIR || 'rust/target');
const flags = [process.env.RUSTFLAGS || '', `--remap-path-prefix=${root}=day064-source`, `--remap-path-prefix=${homedir()}=/build`].filter(Boolean).join(' ');
const result = spawnSync(cargo, ['build', '--offline', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', 'rust/Cargo.toml'], { cwd: root, env: { ...process.env, RUSTFLAGS: flags }, stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('Rust/Wasm build failed. Install Rust and the wasm32-unknown-unknown target.');
await mkdir(join(root, 'public/engine'), { recursive: true });
const wasm = await readFile(join(target, 'wasm32-unknown-unknown/release/breach_atlas_engine.wasm'));
// The precompiled standard library may retain its installation path in panic
// messages. Remapping this crate cannot change those literals. Rewrite only
// that known prefix, preserving its byte length and all WebAssembly offsets.
const prefix = Buffer.from(`${homedir()}/.rustup/`);
const publicPrefix = Buffer.from('/toolchain/'.padEnd(prefix.length, '/'));
if (publicPrefix.length !== prefix.length) throw new Error('Unexpected toolchain path length.');
let offset = 0, redacted = 0;
while ((offset = wasm.indexOf(prefix, offset)) !== -1) {
  publicPrefix.copy(wasm, offset); offset += prefix.length; redacted++;
}
if (wasm.includes(Buffer.from(homedir()))) throw new Error('A local build path remains in the public engine.');
new WebAssembly.Module(wasm);
await writeFile(join(root, 'public/engine/search.wasm'), wasm);
console.log(`Removed ${redacted} precompiled toolchain path prefixes.`);
console.log('Built the dependency-free Rust search engine for the browser Worker.');
