export type IconName = 'flame' | 'path' | 'review' | 'book' | 'record' | 'share' | 'close' | 'check' | 'lock' | 'star' | 'arrow' | 'hand';
export function Icon({ name, size = 24, class: className = '' }: { name: IconName; size?: number; class?: string }) {
  const paths: Record<IconName, string> = {
    flame: 'M13 2c1 6-5 6-4 11 2-1 3-3 3-5 5 4 8 6 7 10-1 6-13 6-14 0-1-4 2-6 2-10 1 2 2 3 3 3 0-4 3-5 3-9Z',
    path: 'M7 21v-4c0-4 10 0 10-5s-10 0-10-5V3m7 0 3 2-3 2M4 3h6',
    review: 'M4 10a8 8 0 1 1 0 5M4 4v6h6m2-3v6l4 2',
    book: 'M12 5C8 2 3 4 3 4v16s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v16M6 8h3m6 0h3',
    record: 'M4 21V12h4v9m2 0V3h4v18m2 0V8h4v13M2 21h20',
    share: 'M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2',
    close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 5 5L20 7',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10m7 4v3',
    star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    hand: 'M7 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v11c0 7-10 9-13 3l-3-5c-1-3 2-4 4-2Z',
  };
  return <svg class={className} width={size} height={size} viewBox="0 0 24 24" fill={name === 'flame' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
