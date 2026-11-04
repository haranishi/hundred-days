/** コードの公開状況に合わせて、1本目のリンクのリプライを作る。 */
export function buildLinkReply({ meta, codeUrl, external }) {
  // 題名の終わり方によらず読めるよう、鉤括弧で囲む。
  const lines = [`👇 「${meta.title}」はこちら`, meta.publicUrl];
  if (meta.social?.x?.codePublished === false || (external && !meta.intro?.codeUrl)) {
    const note = meta.social?.x?.linkReplyNote?.trim();
    if (note) lines.push('', note);
  } else {
    lines.push('', 'コードも公開しています', codeUrl);
  }
  return lines.join('\n');
}
