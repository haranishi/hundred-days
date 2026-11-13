import { ReadableText } from './ReadableText';

export function SourceLink({ url, title, publisher }: { url: string; title: string; publisher?: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer"><ReadableText text={title} endAdornment={<><span aria-hidden="true"> </span><svg class="external-link" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4" /></svg></>} /><span class="sr-only">（新しいタブで開きます）</span>{publisher && <span class="small"><ReadableText text={publisher} /></span>}</a>;
}
