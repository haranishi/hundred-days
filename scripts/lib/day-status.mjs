/* 下書きのDayを、公開前の検査のあいだだけ「公開済み」とみなす。
   ビルドは下書きを dist/ に入れず、共有・OGP・ヘッダーの横断の試験も published のDayしか見ないので、下書きにはその契約が掛からず、
   公開した瞬間に初めてCIで落ちていた（Day70・Day71）。meta.json は書き換えず（中断すると作業ツリーが汚れる）、
   環境変数 PUBLISH_CHECK_DAY で判定だけを変える。 */

export const PUBLISH_CHECK_ENV = 'PUBLISH_CHECK_DAY';

const DAY_DIR = /^day-(\d{3})-/;

/** PUBLISH_CHECK_DAY の値（71・071・day-071-kage-shogen をカンマ区切り）を、空白を除いた指定の並びにする */
export function publishCheckTargets(env = process.env) {
  const targets = String(env[PUBLISH_CHECK_ENV] ?? '')
    .split(',')
    .map((token) => token.replace(/\s+/g, ''))
    .filter(Boolean);
  // 本番のビルドはCIで走る。そこで効くと、下書きがそのまま公開されてしまう
  if (targets.length && env.GITHUB_ACTIONS === 'true') {
    throw new Error(`${PUBLISH_CHECK_ENV} は手元の公開前の検査専用です。GitHub Actions では使えません（下書きが本番に出るのを防ぐため）。`);
  }
  return targets;
}

/** 指定の1つ（番号かフォルダ名）が、そのDayのフォルダを指すか */
export function matchesDay(target, dir) {
  const number = DAY_DIR.exec(dir)?.[1];
  if (!number) return false;
  return /^\d+$/.test(target) ? Number(target) === Number(number) : target === dir;
}

export function effectiveStatus(meta, dir, env = process.env) {
  const status = meta?.status || 'published';
  const targets = publishCheckTargets(env);
  if (status === 'draft' && targets.some((target) => matchesDay(target, dir))) return 'published';
  return status;
}

/** PUBLISH_CHECK_DAY によって、下書きから公開済みに変わったか（ビルドの出力に名前を出すため） */
export function isPublishCheckOverride(meta, dir, env = process.env) {
  return (meta?.status || 'published') !== effectiveStatus(meta, dir, env);
}

/** どのDayのフォルダも指さない指定。打ち間違えると、検査したつもりで何も変わらないので知らせる */
export function unmatchedPublishCheckTargets(dirs, env = process.env) {
  return publishCheckTargets(env).filter((target) => !dirs.some((dir) => matchesDay(target, dir)));
}
