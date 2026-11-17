import { html } from '../lib.js';
import { api } from '../api.js';
import { confirmDialog, invalidate, optimistic, setQuery, toast, useQuery } from '../store.js';
import { WEEKDAYS } from '../format.js';
import { Button, EmptyState, ErrorState, IconButton, PageHead, Skel } from '../components/ui.js';

export const usePlans = () => useQuery('plans', () => api.get('/plans'));

async function activate(plan) {
  const res = await optimistic('plans', (list) => list.map((p) => ({ ...p, is_active: p.id === plan.id })),
    () => api.post(`/plans/${plan.id}/activate`), "Couldn't switch plans.");
  if (res.ok) {
    toast(`${plan.name} is now your active plan`);
    invalidate('dashboard');
  }
}

async function duplicate(plan) {
  const tmp = { ...plan, id: `tmp-${Date.now()}`, name: `${plan.name} (copy)`, is_active: false, pending: true };
  const res = await optimistic('plans', (list) => [...list, tmp], () => api.post(`/plans/${plan.id}/duplicate`), "Couldn't duplicate the plan.");
  if (res.ok) setQuery('plans', (list) => list.map((p) => (p.id === tmp.id ? res.data : p)));
}

async function remove(plan) {
  const ok = await confirmDialog({
    title: `Delete ${plan.name}?`,
    body: 'The plan and its days will be deleted. Workouts you already logged stay in your history.',
    confirmLabel: 'Delete plan', danger: true,
  });
  if (!ok) return;
  const res = await optimistic('plans', (list) => list.filter((p) => p.id !== plan.id), () => api.del(`/plans/${plan.id}`), "Couldn't delete the plan.");
  if (res.ok) {
    toast('Plan deleted');
    invalidate('dashboard', 'plans'); // deleting the active plan promotes another one
  }
}

function PlanCard({ plan }) {
  const exercises = plan.days.reduce((n, d) => n + d.exercises.length, 0);
  return html`<div class=${`card stack ${plan.pending ? 'pending' : ''}`} style="gap:12px">
    <div>
      <div class="row" style="gap:8px">
        <h2 class="grow truncate" style="font-size:18px">${plan.name}</h2>
        ${plan.is_active && html`<span class="badge accent">Active</span>`}
      </div>
      <p class="muted small">${[plan.goal, `${plan.days.length} ${plan.days.length === 1 ? 'day' : 'days'}`, `${exercises} exercises`].filter(Boolean).join(' · ')}</p>
    </div>
    ${plan.description && html`<p class="small" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${plan.description}</p>`}
    <div class="row wrap" style="gap:6px">
      ${plan.days.map((d) => html`<span class="chip" key=${d.id}>${d.weekday !== null ? html`<b style="margin-right:5px">${WEEKDAYS[d.weekday]}</b>` : ''}${d.name}</span>`)}
      ${!plan.days.length && html`<span class="muted small">No days yet. Edit the plan to add some.</span>`}
    </div>
    <div class="row wrap" style="gap:6px;margin-top:auto;padding-top:4px">
      <a class="btn sm" href=${`#/plans/${plan.id}/review`}>Review</a>
      <a class="btn sm" href=${`#/plans/${plan.id}`}>Edit</a>
      ${!plan.is_active && html`<${Button} size="sm" onClick=${() => activate(plan)}>Set active<//>`}
      <span class="grow"></span>
      <${IconButton} icon="copy" label="Duplicate plan" onClick=${() => duplicate(plan)} />
      <${IconButton} icon="trash" label="Delete plan" onClick=${() => remove(plan)} />
    </div>
  </div>`;
}

export function PlansPage() {
  const q = usePlans();
  return html`<div class="page">
    <${PageHead} title="Plans" sub="Your training programmes. The active one drives the dashboard and the start screen.">
      <a class="btn primary" href="#/plans/new">New plan</a>
    <//>
    ${q.data === undefined && (q.error
      ? html`<${ErrorState} error=${q.error} onRetry=${q.reload} />`
      : html`<div class="grid cards" aria-busy="true">${[1, 2].map((i) => html`<div class="card stack" key=${i}>
          <${Skel} w="55%" h=${20} /><${Skel} w="40%" h=${12} /><${Skel} h=${30} /><${Skel} w="60%" h=${32} /></div>`)}</div>`)}
    ${q.data && !q.data.length && html`<div class="card"><${EmptyState} icon="plan" title="No plans yet"
      action=${html`<a class="btn primary" href="#/plans/new">Create your first plan</a>`}>
      A plan is a set of training days, each with its exercises, target sets, rep ranges and rest times.<//></div>`}
    ${q.data && q.data.length > 0 && html`<div class="grid cards">
      ${q.data.map((p) => html`<${PlanCard} key=${p.id} plan=${p} />`)}
    </div>`}
  </div>`;
}
