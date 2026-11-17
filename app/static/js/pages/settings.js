import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { clearQueries, invalidate, setState, toast, toastError, useStore } from '../store.js';
import { Button, Field, PageHead, Segmented } from '../components/ui.js';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function readTheme() {
  try { return localStorage.getItem('replog.theme') || 'system'; } catch { return 'system'; }
}
function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('replog.theme', theme); } catch {}
}

export function SettingsPage() {
  const { user } = useStore();
  const [name, setName] = useState(user.name);
  const [rest, setRest] = useState(user.default_rest_sec);
  const [theme, setTheme] = useState(readTheme);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  // optimistic: the new value shows at once and rolls back if the server refuses it
  async function saveProfile(patch, done = 'Saved') {
    const before = user;
    setState({ user: { ...user, ...patch } });
    try {
      setState({ user: await api.patch('/auth/me', patch) });
      invalidate('workout');
      toast(done);
    } catch (err) {
      setState({ user: before });
      toastError(`Couldn't save. ${err.message}`);
    }
  }
  async function changePassword(e) {
    e.preventDefault();
    setPwBusy(true);
    setPwError('');
    try {
      await api.post('/auth/password', pw);
      setPw({ current_password: '', new_password: '' });
      toast('Password changed. Other devices were signed out.');
    } catch (err) {
      setPwError(err.message);
    }
    setPwBusy(false);
  }
  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    clearQueries();
    setState({ user: null });
  }

  return html`<div class="page narrow">
    <${PageHead} title="Settings" />
    <div class="stack" style="gap:16px">
      <form class="card stack" onSubmit=${(e) => { e.preventDefault(); saveProfile({ name: name.trim(), default_rest_sec: Number(rest) }, 'Profile saved'); }}>
        <h2>Profile</h2>
        <div class="form-grid">
          <${Field} label="Name"><input class="input" required maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} /><//>
          <${Field} label="Email"><input class="input" value=${user.email} disabled /><//>
          <${Field} label="Default rest between sets (seconds)">
            <input class="input" type="number" min="10" max="600" step="5" required value=${rest} onInput=${(e) => setRest(e.target.value)} /><//>
        </div>
        <p class="muted small">Used when an exercise in your plan has no rest time of its own.</p>
        <div><${Button} type="submit" variant="primary">Save profile<//></div>
      </form>

      <div class="card stack">
        <h2>Preferences</h2>
        <div class="row wrap">
          <div class="grow"><div style="font-weight:600">Weight unit</div>
            <div class="muted small">Changes the label and the plus/minus step. Numbers you already logged are not converted.</div></div>
          <${Segmented} value=${user.units} options=${[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
            onChange=${(units) => units !== user.units && saveProfile({ units }, `Using ${units}`)} />
        </div>
        <div class="row wrap">
          <div class="grow"><div style="font-weight:600">Theme</div><div class="muted small">Saved on this device.</div></div>
          <${Segmented} value=${theme} options=${THEMES} onChange=${(t) => { setTheme(t); applyTheme(t); }} />
        </div>
      </div>

      <form class="card stack" onSubmit=${changePassword}>
        <h2>Password</h2>
        <div class="form-grid">
          <${Field} label="Current password"><input class="input" type="password" required autocomplete="current-password"
            value=${pw.current_password} onInput=${(e) => setPw({ ...pw, current_password: e.target.value })} /><//>
          <${Field} label="New password"><input class="input" type="password" required minlength="8" autocomplete="new-password"
            value=${pw.new_password} onInput=${(e) => setPw({ ...pw, new_password: e.target.value })} /><//>
        </div>
        ${pwError && html`<div class="form-error" role="alert">${pwError}</div>`}
        <div><${Button} type="submit" busy=${pwBusy}>Change password<//></div>
      </form>

      <div class="card row wrap">
        <div class="grow"><h2>Log out</h2><p class="muted small">Signed in as ${user.email}</p></div>
        <${Button} icon="logout" onClick=${logout}>Log out<//>
      </div>
    </div>
  </div>`;
}
