'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

/** Register installed fonts in a disposable LibreOffice profile, never in the document or app bundle. */
async function prepareFontProfile(profile, run, platform = process.platform) {
  if (platform !== 'darwin') return;
  const { stdout } = await run('fc-list', ['--format', '%{file}\t%{family}\n']);
  const files = new Set();
  const families = new Set();
  for (const line of String(stdout).split('\n')) {
    const [file, family = ''] = line.split('\t');
    if (!path.isAbsolute(file || '') || !/\.(otf|ttf|ttc|otc)$/i.test(file)) continue;
    files.add(file);
    for (const name of family.split(',')) families.add(name.trim());
  }
  if (!files.size) throw new Error('No installed fonts were found for conversion');
  const directory = path.join(profile, 'user', 'fonts');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const name = crypto.createHash('sha256').update(file).digest('hex').slice(0, 24) + path.extname(file);
    await fs.symlink(file, path.join(directory, name));
  }
  if (families.has('YuGothic')) {
    // These Windows names and the installed Mac family identify the same typeface.
    // Do not map unrelated or unavailable theme fonts to an arbitrary replacement.
    const rules = ['游ゴシック', '游ゴシック Bold'].map(name => `
      <match target="pattern">
        <test name="family" compare="eq"><string>${name}</string></test>
        <edit name="family" mode="assign" binding="strong"><string>YuGothic</string></edit>
        ${name.endsWith(' Bold') ? '<edit name="weight" mode="assign"><const>bold</const></edit>' : ''}
      </match>`).join('');
    await fs.writeFile(path.join(directory, 'fc_local.conf'),
      `<?xml version="1.0"?><fontconfig>${rules}</fontconfig>`, { mode: 0o600 });
  }
}

module.exports = { prepareFontProfile };
