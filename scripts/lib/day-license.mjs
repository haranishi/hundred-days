/* Dayのフォルダ直下に LICENSE（リポジトリ直下のMITと同じ内容）を置くべきか。
   リポジトリ直下のMITが全体に及ぶので、法的には直下の1枚で足りる。各Dayに写しを置くのは、フォルダだけ持ち出しても条件が分かるようにするため。
   置くのは、コードがこのリポジトリにあるDay（status が external 以外、または外部Dayでも source/package.json でコードを置いているもの）。
   置かないのは、アプリ本体のコードがここに無い外部Day。そのフォルダにMITを置くと、その製品がMITだと読めてしまう。
   status が無いDayは published として扱う（day-status.mjs・build.mjs と同じ）。 */
export function needsDayLicense(meta, { hasSource = false } = {}) {
  const status = meta?.status || 'published';
  return status !== 'external' || Boolean(hasSource);
}
