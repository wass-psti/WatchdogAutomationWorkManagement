import type { ApplicationRoute } from '../../../src/platform/contracts/routing.ts';

export function parseRoute(): ApplicationRoute {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return Object.freeze({ name: 'home' });
  const [first, second] = raw.split('/');
  if (first === 'app' && second) return Object.freeze({ name: 'app', moduleId: decodeURIComponent(second) });
  if (first === 'boards' && second) return Object.freeze({ name: 'board', boardId: decodeURIComponent(second) });
  if (first === 'boards') return Object.freeze({ name: 'boards' });
  if (first === 'settings') return Object.freeze({ name: 'settings' });
  if (first === 'login') return Object.freeze({ name: 'login' });
  if (first === 'register') return Object.freeze({ name: 'register' });
  if (first === 'verify') return Object.freeze({ name: 'verify' });
  if (first === 'account') return Object.freeze({ name: 'account' });
  if (first === 'users') return Object.freeze({ name: 'users' });
  return Object.freeze({ name: 'not-found' });
}

export function navigate(path: string): boolean {
  const target = `#/${String(path || '').replace(/^\/+/, '')}`;
  if (location.hash === target) return false;
  location.hash = target;
  return true;
}
