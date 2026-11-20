export const WRAP_CSS = `
.uxr-page{word-break:keep-all;overflow-wrap:anywhere;line-break:strict}
.uxr-page .uxr-nb{white-space:nowrap}
/* text-wrap:pretty・balance は、overflow-wrap:anywhere の「どこでも折れる」も候補にして、文節の途中（「ご記入くださ／い。」）を選ぶことがある。
   文章の要素だけ break-word（本当に収まらないときだけ折る）にして防ぐ。容れ物は anywhere のまま＝長い英数字が枠からはみ出さない。 */
.uxr-page :where(h1,h2,h3,h4,p,li,dt,dd,blockquote,th,td){overflow-wrap:break-word}
`;
