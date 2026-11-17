import { html, useEffect, useState } from '../lib.js';
import { api } from '../api.js';
import { useQuery, useStore } from '../store.js';
import { fmtClock } from '../format.js';
import { Icon, Modal } from './ui.js';

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/plans', label: 'Plans', icon: 'plan' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/exercises', label: 'Exercises', icon: 'list' },
  { href: '/body', label: 'Body', icon: 'scale' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const isActive = (href, path) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export const useActiveWorkout = () => useQuery('workout:active', () => api.get('/workouts/active'));

/** Ticks once a second and returns the seconds since `since`. */
export function useElapsed(since) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return since ? (Date.now() - new Date(since).getTime()) / 1000 : 0;
}

function ResumeBar({ workout }) {
  const elapsed = useElapsed(workout.started_at);
  return html`<a class="resume" href="#/workout">
    <span class="pulse"></span>
    <span class="grow truncate">${workout.name} in progress</span>
    <span class="num">${fmtClock(elapsed)}</span>
    <${Icon} name="right" size=${16} />
  </a>`;
}

export function Shell({ path, children }) {
  const { user } = useStore();
  const { data: active } = useActiveWorkout();
  const [more, setMore] = useState(false);
  const onWorkout = path === '/workout';
  const link = (item) => html`<a key=${item.href} href=${'#' + item.href}
    class=${`nav-link ${isActive(item.href, path) ? 'active' : ''}`} onClick=${() => setMore(false)}>
    <${Icon} name=${item.icon} />${item.label}</a>`;
  const tab = (item) => html`<a href=${'#' + item.href} class=${`tab ${isActive(item.href, path) ? 'active' : ''}`}>
    <${Icon} name=${item.icon} size=${21} />${item.label === 'Dashboard' ? 'Home' : item.label}</a>`;
  return html`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><${Icon} name="dumbbell" /></span>RepLog</div>
      <a href="#/workout" class=${`nav-link nav-cta ${onWorkout ? 'active' : ''}`}>
        <${Icon} name="play" fill />${active ? 'Resume workout' : 'Start workout'}</a>
      ${NAV.map(link)}
      <a class="sidebar-foot" href="#/settings">
        <span class="avatar">${user.name.slice(0, 1).toUpperCase()}</span>
        <span class="grow"><div class="truncate" style="font-weight:600">${user.name}</div><div class="tiny muted truncate">${user.email}</div></span>
      </a>
    </aside>
    <main class="main">
      ${active && !onWorkout && html`<${ResumeBar} workout=${active} />`}
      ${children}
    </main>
    <nav class="tabbar" aria-label="Main">
      ${tab(NAV[0])}
      ${tab(NAV[1])}
      <a href="#/workout" class=${`tab tab-main ${onWorkout ? 'active' : ''}`} aria-label="Workout">
        <span class="fab"><${Icon} name=${active ? 'timer' : 'play'} size=${22} fill=${!active} /></span></a>
      ${tab(NAV[2])}
      <button type="button" class=${`tab ${NAV.slice(3).some((n) => isActive(n.href, path)) ? 'active' : ''}`} onClick=${() => setMore(true)}>
        <${Icon} name="more" size=${21} />More</button>
    </nav>
    ${more && html`<${Modal} title="More" onClose=${() => setMore(false)}>
      <div style="margin:-6px -8px 0">${NAV.slice(3).map(link)}</div>
    <//>`}
  </div>`;
}
