import { useEffect, useState } from './lib.js';

const current = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

export function useRoute() {
  const [path, setPath] = useState(current());
  useEffect(() => {
    const onChange = () => {
      setPath(current());
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function navigate(path) {
  location.hash = path;
}

/** match('/plans/:id', '/plans/4') -> { id: '4' }, or null */
export function match(pattern, path) {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] === ':') params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
