// App state, a small query cache (show cached data, refresh in the background),
// and the optimistic-update helpers every page uses.
import { useEffect, useState } from './lib.js';

const state = { user: undefined, toasts: [], confirm: null };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function useRerender() {
  const [, set] = useState(0);
  useEffect(() => {
    const fn = () => set((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
}

export function useStore() {
  useRerender();
  return state;
}
export const getState = () => state;
export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

// ---------- toasts & confirm ----------
let toastId = 0;
export function toast(text, { kind = 'info', action = null, duration = 3500, onClose = null } = {}) {
  const id = ++toastId;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // a toast pushed off screen by newer ones must still run onClose: it sends the pending delete
    if (state.toasts.some((t) => t.id === id)) setState({ toasts: state.toasts.filter((t) => t.id !== id) });
    if (onClose) onClose();
  };
  setState({ toasts: [...state.toasts.slice(-2), { id, text, kind, action, close }] });
  setTimeout(close, duration);
  return close;
}
export const toastError = (text) => toast(text, { kind: 'error', duration: 5000 });

export function confirmDialog(options) {
  return new Promise((resolve) => {
    setState({
      confirm: {
        ...options,
        resolve: (value) => {
          setState({ confirm: null });
          resolve(value);
        },
      },
    });
  });
}

// ---------- query cache ----------
const queries = new Map();
const hidden = new Map(); // key -> ids being deleted, kept out of refetched lists until settled

function entry(key) {
  if (!queries.has(key)) queries.set(key, { data: undefined, error: null, loading: false, subs: 0 });
  return queries.get(key);
}

export function fetchQuery(key, fetcher) {
  const e = entry(key);
  if (fetcher) e.fetcher = fetcher;
  if (e.promise || !e.fetcher) return e.promise;
  e.loading = true;
  e.promise = e
    .fetcher()
    .then(
      (data) => {
        const hide = hidden.get(key);
        e.data = hide && hide.size && Array.isArray(data) ? data.filter((x) => !hide.has(x.id)) : data;
        e.error = null;
      },
      (err) => {
        e.error = err;
      },
    )
    .finally(() => {
      e.loading = false;
      e.promise = null;
      notify();
    });
  notify();
  return e.promise;
}

/** Returns { data, error, loading, reload }. `data` stays undefined until the first load. */
export function useQuery(key, fetcher) {
  useRerender();
  useEffect(() => {
    if (!key) return undefined;
    const e = entry(key);
    e.subs++;
    fetchQuery(key, fetcher);
    return () => {
      e.subs--;
    };
  }, [key]);
  if (!key) return { data: undefined, error: null, loading: false, reload() {} };
  const e = entry(key);
  return { data: e.data, error: e.error, loading: e.loading, reload: () => fetchQuery(key, fetcher) };
}

export const getQuery = (key) => entry(key).data;
export function setQuery(key, updater) {
  const e = entry(key);
  e.data = typeof updater === 'function' ? updater(e.data) : updater;
  notify();
}

/** Refresh every cached query whose key starts with one of the prefixes. */
export function invalidate(...prefixes) {
  for (const [key, e] of queries) {
    if (!prefixes.some((p) => key === p || key.startsWith(p + ':'))) continue;
    if (e.subs > 0) fetchQuery(key);
    else queries.delete(key);
  }
}
export function clearQueries() {
  queries.clear();
  hidden.clear();
}

/**
 * Apply `updater` to the cache straight away, then run `request`.
 * If the request fails the cache is rolled back and an error toast is shown.
 * Resolves to { ok, data }.
 */
export async function optimistic(key, updater, request, errorText = "Couldn't save.") {
  const before = getQuery(key);
  setQuery(key, updater);
  try {
    return { ok: true, data: await request() };
  } catch (err) {
    setQuery(key, before);
    toastError(`${errorText} ${err.message}`);
    return { ok: false };
  }
}

const pendingDeletes = new Set();
addEventListener('pagehide', () => pendingDeletes.forEach((commit) => commit()));

/**
 * Remove an item from a cached list now, show an Undo toast, and only send the
 * delete once the toast goes away.
 */
export function deleteWithUndo({ key, id, label, request, onDone }) {
  const list = getQuery(key) || [];
  const index = list.findIndex((x) => x.id === id);
  if (index < 0) return;
  const item = list[index];
  const hide = hidden.get(key) || hidden.set(key, new Set()).get(key);
  hide.add(id);
  setQuery(key, (l) => l.filter((x) => x.id !== id));
  const restore = () => {
    hide.delete(id);
    setQuery(key, (l) => {
      if (!l || l.some((x) => x.id === id)) return l;
      const copy = [...l];
      copy.splice(Math.min(index, copy.length), 0, item);
      return copy;
    });
  };
  let settled = false;
  const commit = async () => {
    if (settled) return;
    settled = true;
    pendingDeletes.delete(commit);
    try {
      const result = await request();
      hide.delete(id);
      if (onDone) onDone(result);
    } catch (err) {
      restore();
      toastError(`Couldn't delete ${label}. ${err.message}`);
    }
  };
  pendingDeletes.add(commit);
  toast(`Deleted ${label}`, {
    duration: 5000,
    onClose: commit,
    action: {
      label: 'Undo',
      run: () => {
        settled = true;
        pendingDeletes.delete(commit);
        restore();
      },
    },
  });
}
