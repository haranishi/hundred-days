"""Build the public local-app download from a fixed, reviewed file list."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

DAY = Path(__file__).resolve().parents[1]
FILES = ['.gitignore', 'LICENSE', 'README.md', 'app.js', 'font-profile.js', 'index.html', 'package-lock.json', 'package.json', 'server.js', 'svg-renderer.js', 'tests/browser.mjs', 'tests/helpers.cjs', 'tests/make_fixture.py', 'tests/ocr.swift', 'tests/server.test.cjs', 'tests/svg-renderer.test.cjs']

def main():
    source = DAY / 'source'
    actual = sorted(p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file() and not any(part in {'node_modules','.runtime','.artifacts','__pycache__'} for part in p.relative_to(source).parts))
    if actual != FILES:
        raise SystemExit('Source contains missing or unreviewed files; package left unchanged')
    target = DAY / 'airpresenter-local.zip'
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            info = ZipInfo('airpresenter/' + name, date_time=(2026,11,5,0,0,0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (source / name).read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    print('Packaged the reviewed local app: %d files' % len(FILES))

if __name__ == '__main__':
    main()
