export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function messageFrom(data, status) {
  const d = data && data.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]) {
    const field = (d[0].loc || []).filter((p) => p !== 'body').join(' ').replace(/_/g, ' ');
    return field ? `${field}: ${d[0].msg}` : d[0].msg;
  }
  return `Something went wrong (${status})`;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: method === 'DELETE', // lets a pending delete finish while the page is closing
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, messageFrom(data, res.status));
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
