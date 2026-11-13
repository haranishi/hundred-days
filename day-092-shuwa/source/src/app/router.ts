export type Route =
  | { name: 'path' | 'welcome' | 'review' | 'weak' | 'dict' | 'spell' | 'me' | 'settings' | 'about' }
  | { name: 'lesson' | 'result'; id: string }
  | { name: 'item'; id: string };

export function parseRoute(hash: string): Route {
  const simple: Record<string, Route['name']> = {
    '#/': 'path', '#/welcome': 'welcome', '#/review': 'review', '#/practice/weak': 'weak',
    '#/dict': 'dict', '#/spell': 'spell', '#/me': 'me', '#/settings': 'settings', '#/about': 'about',
  };
  const name = simple[hash];
  if (name) return { name } as Route;
  const match = /^#\/(lesson|dict)\/([^/]+)(\/result)?$/.exec(hash);
  if (!match || (match[1] === 'dict' && match[3])) return { name: 'path' };
  try {
    const id = decodeURIComponent(match[2]!);
    if (!id || /[/\u0000-\u001f]/.test(id)) return { name: 'path' };
    return { name: match[1] === 'dict' ? 'item' : match[3] ? 'result' : 'lesson', id };
  } catch { return { name: 'path' }; }
}

export function routeHash(route: Route): string {
  if ('id' in route) return route.name === 'item' ? `#/dict/${encodeURIComponent(route.id)}`
    : `#/lesson/${encodeURIComponent(route.id)}${route.name === 'result' ? '/result' : ''}`;
  return route.name === 'path' ? '#/' : route.name === 'weak' ? '#/practice/weak' : `#/${route.name}`;
}

export function navigate(hash: string, replace = false): void {
  const next = routeHash(parseRoute(hash));
  if (replace) {
    history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash !== next) location.hash = next;
}

let guard: ((hash: string) => boolean) | null = null;
export function setRouteGuard(next: typeof guard): void { guard = next; }
export function canNavigate(hash: string): boolean { return guard?.(hash) ?? true; }
