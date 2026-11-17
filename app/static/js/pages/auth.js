import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { setState } from '../store.js';
import { navigate } from '../router.js';
import { Button, Field, Icon } from '../components/ui.js';

const DEMO = { email: 'demo@replog.app', password: 'demo1234' };

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(which, body) {
    setBusy(which);
    setError('');
    try {
      const user = await api.post(which === 'register' ? '/auth/register' : '/auth/login', body);
      navigate('/');
      setState({ user });
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }
  const onSubmit = (e) => {
    e.preventDefault();
    submit(mode, mode === 'register' ? form : { email: form.email, password: form.password });
  };

  return html`<div class="auth">
    <div class="auth-art">
      <div class="brand"><span class="brand-mark"><${Icon} name="dumbbell" /></span>RepLog</div>
      <div style="position:relative;z-index:1">
        <h1>Plan it. Lift it. Log every rep.</h1>
        <p>Build your programme, count reps and rest on your phone between sets, and see week by week whether the plan is working.</p>
      </div>
      <span></span>
    </div>
    <div class="auth-form"><div>
      <div>
        <h1>${mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p class="muted" style="margin-top:4px">${mode === 'login' ? 'Log in to pick up where you left off.' : 'You start with a library of 60 exercises.'}</p>
      </div>
      <form class="stack" onSubmit=${onSubmit}>
        ${mode === 'register' && html`<${Field} label="Name">
          <input class="input" required maxlength="80" autocomplete="name" value=${form.name} onInput=${set('name')} /><//>`}
        <${Field} label="Email">
          <input class="input" type="email" required autocomplete="email" value=${form.email} onInput=${set('email')} /><//>
        <${Field} label="Password">
          <input class="input" type="password" required minlength=${mode === 'register' ? 8 : 1}
            autocomplete=${mode === 'register' ? 'new-password' : 'current-password'} value=${form.password} onInput=${set('password')} />
          ${mode === 'register' && html`<span style="font-weight:400">At least 8 characters.</span>`}<//>
        ${error && html`<div class="form-error" role="alert">${error}</div>`}
        <${Button} type="submit" variant="primary" size="lg" busy=${busy === mode} disabled=${!!busy}>
          ${mode === 'login' ? 'Log in' : 'Create account'}<//>
      </form>
      <div class="divider">or</div>
      <${Button} size="lg" icon="play" busy=${busy === 'demo'} disabled=${!!busy} onClick=${() => submit('demo', DEMO)}>Try the demo account<//>
      <p class="muted small" style="text-align:center">
        ${mode === 'login' ? 'New here? ' : 'Already have an account? '}
        <button class="link" type="button" onClick=${() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          ${mode === 'login' ? 'Create an account' : 'Log in'}</button>
      </p>
    </div></div>
  </div>`;
}
