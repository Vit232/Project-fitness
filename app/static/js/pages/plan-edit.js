import { html, useEffect, useState } from '../lib.js';
import { api } from '../api.js';
import { invalidate, setQuery, toast, toastError, useQuery, useStore } from '../store.js';
import { navigate } from '../router.js';
import { WEEKDAYS_LONG, repUnit } from '../format.js';
import { ExercisePicker } from '../components/exercise-picker.js';
import { Button, EmptyState, ErrorState, Field, IconButton, NumInput, PageHead, Skel } from '../components/ui.js';

const GOALS = ['Build muscle', 'Get stronger', 'Lose fat', 'General fitness', 'Endurance'];
let uid = 0;
const withKeys = (plan) => ({ ...plan, days: plan.days.map((d) => ({ ...d, key: ++uid, exercises: d.exercises.map((e) => ({ ...e })) })) });
const blank = () => withKeys({ name: '', goal: GOALS[0], description: '', days: [{ name: 'Day 1', weekday: null, exercises: [] }] });

function move(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}

function DayCard({ day, index, count, onChange, onMove, onRemove, defaultRest }) {
  const [picking, setPicking] = useState(false);
  const setEx = (i, patch) => onChange({ ...day, exercises: day.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const add = (ex) => {
    setPicking(false);
    onChange({ ...day, exercises: [...day.exercises, {
      exercise_id: ex.id, name: ex.name, muscle_group: ex.muscle_group, kind: ex.kind,
      target_sets: 3, rep_min: ex.kind === 'timed' ? 30 : 8, rep_max: ex.kind === 'timed' ? 60 : 12, target_weight: null, rest_sec: defaultRest,
    }] });
  };
  const num = (e, i, field, label, step = 1) => html`<label><span>${label}</span>
    <${NumInput} class="input bare" value=${e[field]} step=${step} aria-label=${`${label} for ${e.name}`}
      onChange=${(v) => setEx(i, { [field]: v })} /></label>`;
  return html`<div class="day-card">
    <div class="day-head">
      <input class="input name" placeholder="Day name, e.g. Push" maxlength="80" value=${day.name} aria-label="Day name"
        onInput=${(e) => onChange({ ...day, name: e.target.value })} />
      <select class="input" style="width:auto;flex:0 1 150px" aria-label="Weekday" value=${day.weekday ?? ''}
        onChange=${(e) => onChange({ ...day, weekday: e.target.value === '' ? null : Number(e.target.value) })}>
        <option value="">Any day</option>
        ${WEEKDAYS_LONG.map((w, i) => html`<option key=${i} value=${i}>${w}</option>`)}
      </select>
      <div class="row" style="gap:2px">
        <${IconButton} icon="up" label="Move day up" disabled=${index === 0} onClick=${() => onMove(-1)} />
        <${IconButton} icon="down" label="Move day down" disabled=${index === count - 1} onClick=${() => onMove(1)} />
        <${IconButton} icon="trash" label="Remove day" onClick=${onRemove} />
      </div>
    </div>
    ${day.exercises.length > 0 && html`<div class="pe-row pe-head">
      <span>Exercise</span><span>Sets</span><span>Min</span><span>Max</span><span>Weight</span><span>Rest s</span><span style="width:96px"></span>
    </div>`}
    ${day.exercises.map((e, i) => html`<div class="pe-row" key=${`${e.exercise_id}-${i}`}>
      <div class="pe-name">
        <div class="truncate" style="font-weight:600">${e.name}</div>
        <div class="tiny muted">${e.muscle_group}${e.kind !== 'weight' ? ` · ${repUnit(e.kind)}` : ''}</div>
      </div>
      ${num(e, i, 'target_sets', 'Sets')}
      ${num(e, i, 'rep_min', 'Min')}
      ${num(e, i, 'rep_max', 'Max')}
      ${e.kind === 'weight' ? num(e, i, 'target_weight', 'Weight', 'any') : html`<label><span>Weight</span><div class="muted" style="text-align:center">–</div></label>`}
      ${num(e, i, 'rest_sec', 'Rest s', 5)}
      <div class="pe-actions">
        <${IconButton} icon="up" label=${`Move ${e.name} up`} disabled=${i === 0} onClick=${() => onChange({ ...day, exercises: move(day.exercises, i, i - 1) })} />
        <${IconButton} icon="down" label=${`Move ${e.name} down`} disabled=${i === day.exercises.length - 1} onClick=${() => onChange({ ...day, exercises: move(day.exercises, i, i + 1) })} />
        <${IconButton} icon="x" label=${`Remove ${e.name}`} onClick=${() => onChange({ ...day, exercises: day.exercises.filter((_, j) => j !== i) })} />
      </div>
    </div>`)}
    <div style="padding:12px 14px" class="row">
      ${!day.exercises.length && html`<span class="muted small grow">No exercises in this day yet.</span>`}
      <${Button} size="sm" icon="plus" onClick=${() => setPicking(true)}>Add exercise<//>
    </div>
    ${picking && html`<${ExercisePicker} title=${`Add to ${day.name || 'this day'}`} onPick=${add} onClose=${() => setPicking(false)}
      exclude=${day.exercises.map((e) => e.exercise_id)} />`}
  </div>`;
}

export function PlanEditPage({ id }) {
  const isNew = id === 'new';
  const { user } = useStore();
  const q = useQuery(isNew ? null : `plan:${id}`, () => api.get(`/plans/${id}`));
  const [plan, setPlan] = useState(isNew ? blank : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (q.data && !plan) setPlan(withKeys(q.data));
  }, [q.data]);

  const back = { href: '#/plans', label: 'Plans' };
  if (!plan) {
    return html`<div class="page narrow"><${PageHead} title="Edit plan" back=${back} />
      ${q.error ? html`<div class="card"><${EmptyState} icon="alert" title="Plan not found"
        action=${html`<a class="btn" href="#/plans">Back to plans</a>`}>${q.error.message}<//></div>`
      : html`<div class="stack" aria-busy="true"><${Skel} h=${120} r=${14} /><${Skel} h=${220} r=${14} /></div>`}</div>`;
  }

  const setDay = (i, day) => setPlan({ ...plan, days: plan.days.map((d, j) => (j === i ? day : d)) });
  async function save(e) {
    e.preventDefault();
    if (plan.days.some((d) => !d.name.trim())) return setError('Give every day a name.');
    setBusy(true);
    setError('');
    const body = {
      name: plan.name, goal: plan.goal, description: plan.description,
      days: plan.days.map((d) => ({
        id: d.id, name: d.name, weekday: d.weekday,
        exercises: d.exercises.map((x) => ({
          exercise_id: x.exercise_id, target_sets: x.target_sets || 1, rep_min: x.rep_min || 1,
          rep_max: Math.max(x.rep_max || 1, x.rep_min || 1), target_weight: x.target_weight, rest_sec: x.rest_sec,
        })),
      })),
    };
    try {
      const saved = isNew ? await api.post('/plans', body) : await api.put(`/plans/${id}`, body);
      setQuery(`plan:${saved.id}`, saved);
      invalidate('plans', 'dashboard', 'plan-review');
      toast(isNew ? 'Plan created' : 'Plan saved');
      navigate('/plans');
    } catch (err) {
      setError(err.message);
      toastError(`Couldn't save the plan. ${err.message}`);
      setBusy(false);
    }
    return undefined;
  }

  return html`<form class="page narrow" style="max-width:860px" onSubmit=${save}>
    <${PageHead} title=${isNew ? 'New plan' : 'Edit plan'} back=${back}>
      <a class="btn" href="#/plans">Cancel</a>
      <${Button} type="submit" variant="primary" icon="check" busy=${busy}>Save plan<//>
    <//>
    <div class="stack" style="gap:16px">
      <div class="card form-grid">
        <${Field} label="Plan name"><input class="input" required maxlength="80" placeholder="e.g. Push / Pull / Legs"
          value=${plan.name} onInput=${(e) => setPlan({ ...plan, name: e.target.value })} /><//>
        <${Field} label="Goal"><select class="input" value=${plan.goal} onChange=${(e) => setPlan({ ...plan, goal: e.target.value })}>
          ${[...new Set([...GOALS, plan.goal].filter(Boolean))].map((g) => html`<option key=${g} value=${g} selected=${g === plan.goal}>${g}</option>`)}</select><//>
        <${Field} label="Notes" class="full"><textarea class="input" maxlength="2000" placeholder="How the plan progresses, anything to remember"
          value=${plan.description} onInput=${(e) => setPlan({ ...plan, description: e.target.value })}></textarea><//>
      </div>

      ${plan.days.map((d, i) => html`<${DayCard} key=${d.key} day=${d} index=${i} count=${plan.days.length} defaultRest=${user.default_rest_sec}
        onChange=${(day) => setDay(i, day)}
        onMove=${(dir) => setPlan({ ...plan, days: move(plan.days, i, i + dir) })}
        onRemove=${() => setPlan({ ...plan, days: plan.days.filter((_, j) => j !== i) })} />`)}

      ${!plan.days.length && html`<div class="card"><${EmptyState} icon="calendar" title="No training days">
        Add a day, then fill it with exercises.<//></div>`}
      <div class="row wrap">
        <${Button} icon="plus" onClick=${() => setPlan({ ...plan, days: [...plan.days, { key: ++uid, name: `Day ${plan.days.length + 1}`, weekday: null, exercises: [] }] })}>Add day<//>
        <span class="grow"></span>
        ${error && html`<span class="form-error" role="alert">${error}</span>`}
        <${Button} type="submit" variant="primary" icon="check" busy=${busy}>Save plan<//>
      </div>
    </div>
  </form>`;
}
