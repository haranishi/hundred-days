import { useEffect, useState } from 'preact/hooks';
import { renderThumbnail } from '../hand';
import type { SignItem } from '../content/types';
import { progress } from '../app/state';
import { mirrorText } from '../content/mirror';
import { Icon } from './icons';
export function Thumbnail({ item, size = 112 }: { item: SignItem; size?: number }) {
  const [ready, setReady] = useState<{ key: string; url: string }>();
  const dominant = progress.value.settings.dominant;
  const key = `${item.id}-${dominant}-${size}`;
  useEffect(() => {
    let active = true;
    void renderThumbnail(item.sign, { dominant, size: size * 2 }).then(url => { if (active) setReady({ key, url }); }).catch(() => {});
    return () => { active = false; };
  }, [item, dominant, size]);
  const label = mirrorText(item.describe.viewer, dominant);
  return <span class={`thumbnail ${ready?.key === key ? '' : 'thumbnail--fallback'}`} style={{ width: size, height: size }}>
    {ready?.key === key ? <img src={ready.url} alt={label} width={size} height={size} />
      : <span class="thumbnail__placeholder" role="img" aria-label={label}><Icon name="hand" size={size * .7} /></span>}
  </span>;
}
