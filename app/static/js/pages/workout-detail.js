import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { confirmDialog, fetchQuery, invalidate, optimistic, setQuery, toast, toastError, useQuery, useStore } from '../store.js';
import { navigate } from '../router.js';
import { fmtCompact, fmtDay, fmtDuration, fmtTime, isoLocal, repUnit } from '../format.js';
import { ExercisePicker } from '../components/exercise-picker.js';
import { Button, EmptyState, Field, Icon, IconButton, Modal, NumInput, PageHead, Skel, SkelTiles, Stars, Tile } from '../components/ui.js';

const refreshStats = () => invalidate('workouts', 'dashboard', 'plan-review', 'exercise-stats');

function EditModal({ workout, onClose }) {
  const key = `workout:${workout.id}`;
  const [form, setForm] = useState({
    name: workout.name, started: isoLocal(new Date(workout.started_at)), duration: workout.duration_min,
    rating: workout.rating, notes: workout.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    const start = new Date(form.started);
    const end = new Date(start.getTime() + Math.max(1, Number(form.duration) || 1) * 60000);
    const body = { name: form.name, notes: form.notes, rating: form.rating, started_at: isoLocal(start) + ':00', finished_at: isoLocal(end) + ':00' };
    const res = await optimistic(key, (w) => ({ ...w, ...body, duration_min: Math.round((end - start) / 60000) }),
      () => api.patch(`/workouts/${workout.id}`, body), "Couldn't save the workout.");
    if (res.ok) {
      refreshStats();
      toast('Workout updated');
      onClose();
    } else setBusy(false);
  };
  return html`<${Modal} title="Edit workout" onClose=${onClose} onSubmit=${save}
    footer=${html`<${Button} onClick=${onClose}>Cancel<//><${Button} type="submit" variant="primary" busy=${busy}>Save<//>`}>
    <${Field} label="Name"><input class="input" required maxlength="80" value=${form.name} onInput=${set('name')} /><//>
    <div class="form-grid">
      <${Field} label="Started"><input class="input" type="datetime-local" required value=${form.started} onInput=${set('started')} /><//>
      <${Field} label="Duration (minutes)"><input class="input" type="number" min="1" max="600" required value=${form.duration} onInput=${set('duration')} /><//>
    </div>
    <${Field} label="Rating"><${Stars} value=${form.rating} onChange=${(rating) => setForm({ ...form, rating })} size=${24} /><//>
    <${Field} label="Notes"><textarea class="input" maxlength="2000" value=${form.notes} onInput=${set('notes')}></textarea><//>
  <//>`;
}

export function WorkoutDetailPage({ id }) {
  const key = `workout:${id}`;
  const { user } = useStore();
  const q = useQuery(key, () => api.get(`/workouts/${id}`));
  const [modal, setModal] = useState(null);
  const w = q.data;
  const back = { href: '#/history', label: 'History' };

  if (!w) {
    return html`<div class="page narrow"><${PageHead} title="Workout" back=${back} />
      ${q.error ? html`<div class="card"><${EmptyState} icon="alert" title="Workout not found"
        action=${html`<a class="btn" href="#/history">Back to history</a>`}>${q.error.message}<//></div>`
      : html`<div class="stack" style="gap:16px" aria-busy="true"><${SkelTiles} n=${3} /><${Skel} h=${200} r=${14} /><${Skel} h=${200} r=${14} /></div>`}</div>`;
  }
  if (!w.finished_at) {
    return html`<div class="page narrow"><${PageHead} title=${w.name} back=${back} />
      <div class="card"><${EmptyState} icon="timer" title="This workout is still in progress"
        action=${html`<a class="btn primary" href="#/workout">Resume workout</a>`}>Finish it to see the summary here.<//></div></div>`;
  }

  const patchSets = (fn) => (cur) => (cur ? { ...cur, sets: fn(cur.sets) } : cur);
  const recount = (cur) => {
    if (!cur) return cur;
    const done = cur.sets.filter((s) => s.completed);
    return { ...cur, set_count: done.length, volume: done.reduce((n, s) => n + (s.is_warmup ? 0 : (s.reps || 0) * (s.weight || 0)), 0) };
  };

  async function saveSet(s, patch) {
    if (Object.keys(patch).every((k) => patch[k] === s[k])) return;
    const res = await optimistic(key, (cur) => recount(patchSets((sets) => sets.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))(cur)),
      () => api.patch(`/workouts/sets/${s.id}`, patch), "Couldn't save that set.");
    if (res.ok) refreshStats();
  }
  async function deleteSet(s) {
    const res = await optimistic(key, (cur) => recount(patchSets((sets) => {
      let n = 0;
      return sets.filter((x) => x.id !== s.id).map((x) => (x.exercise_id === s.exercise_id ? { ...x, set_number: ++n } : x));
    })(cur)), () => api.del(`/workouts/sets/${s.id}`), "Couldn't remove that set.");
    if (res.ok) refreshStats();
  }
  async function addSet(g) {
    const last = g.sets[g.sets.length - 1];
    const body = { exercise_id: g.exercise_id, reps: last ? last.reps : null, weight: last ? last.weight : null, completed: true };
    const tmp = { ...(last || {}), ...body, id: `tmp-${Date.now()}`, set_number: g.sets.length + 1 };
    const res = await optimistic(key, (cur) => recount(patchSets((sets) => [...sets, tmp])(cur)),
      () => api.post(`/workouts/${id}/sets`, body), "Couldn't add a set.");
    if (res.ok) {
      setQuery(key, patchSets((sets) => sets.map((x) => (x.id === tmp.id ? res.data[0] : x))));
      refreshStats();
    }
  }
  async function addExercise(ex) {
    setModal(null);
    try {
      await api.post(`/workouts/${id}/sets`, { exercise_id: ex.id, completed: true, reps: 0 });
      await fetchQuery(key);
      refreshStats();
    } catch (err) {
      toastError(`Couldn't add ${ex.name}. ${err.message}`);
    }
  }
  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete this workout?', body: `${w.name} from ${fmtDay(w.started_at).toLowerCase()} and its ${w.set_count} sets will be deleted for good.`,
      confirmLabel: 'Delete workout', danger: true,
    });
    if (!ok) return;
    navigate('/history');
    const res = await optimistic('workouts', (list) => list && list.filter((x) => x.id !== w.id), () => api.del(`/workouts/${w.id}`), "Couldn't delete the workout.");
    if (res.ok) {
      toast('Workout deleted');
      invalidate('dashboard', 'plan-review', 'exercise-stats');
    }
  }

  const groups = w.exercises.map((ex) => ({ ...ex, sets: w.sets.filter((s) => s.exercise_id === ex.exercise_id) }));
  return html`<div class="page narrow">
    <${PageHead} title=${w.name} back=${back}
      sub=${html`${fmtDay(w.started_at)} at ${fmtTime(w.started_at)} ${w.rating ? html` · <${Stars} value=${w.rating} size=${13} />` : ''}`}>
      <${Button} icon="edit" onClick=${() => setModal('edit')}>Edit<//>
      <${IconButton} icon="trash" label="Delete workout" size="" onClick=${remove} />
    <//>
    <div class="stack" style="gap:16px">
      <div class="grid tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <${Tile} label="Time" icon="timer" value=${fmtDuration(w.duration_min)} />
        <${Tile} label="Sets" icon="list" value=${w.set_count} />
        <${Tile} label="Volume" icon="chart" value=${fmtCompact(w.volume)} unit=${user.units} />
      </div>
      ${w.notes && html`<div class="card"><h3 class="muted" style="margin-bottom:4px">Notes</h3><p style="white-space:pre-wrap">${w.notes}</p></div>`}

      ${groups.map((g) => html`<div class="card" key=${g.exercise_id}>
        <div class="card-head" style="margin-bottom:8px">
          <div class="grow"><a href=${`#/exercises/${g.exercise_id}`}><h2>${g.name}</h2></a><div class="tiny muted">${g.muscle_group}</div></div>
        </div>
        ${g.sets.map((s) => html`<div class=${`row ${typeof s.id !== 'number' ? 'pending' : ''}`} key=${s.id} style="padding:4px 0">
          <span class="set-no">${s.set_number}</span>
          ${g.kind === 'weight' && html`
            <${NumInput} class="input bare" style="width:84px" step="any" value=${s.weight} aria-label=${`Set ${s.set_number} weight`}
              disabled=${typeof s.id !== 'number'} onCommit=${(v) => saveSet(s, { weight: v ?? 0 })} />
            <span class="muted small">${user.units} ×</span>`}
          <${NumInput} class="input bare" style="width:70px" value=${s.reps} aria-label=${`Set ${s.set_number} ${repUnit(g.kind)}`}
            disabled=${typeof s.id !== 'number'} onCommit=${(v) => saveSet(s, { reps: v ?? 0 })} />
          <span class="muted small grow">${repUnit(g.kind)}</span>
          <${IconButton} icon="trash" label=${`Remove set ${s.set_number}`} disabled=${typeof s.id !== 'number'} onClick=${() => deleteSet(s)} />
        </div>`)}
        <${Button} variant="ghost" size="sm" icon="plus" style="margin-top:6px" onClick=${() => addSet(g)}>Add set<//>
      </div>`)}
      ${!groups.length && html`<div class="card"><${EmptyState} icon="dumbbell" title="No sets in this workout">Add an exercise to log what you did.<//></div>`}
      <div><${Button} icon="plus" onClick=${() => setModal('add')}>Add exercise<//></div>
    </div>
    ${modal === 'edit' && html`<${EditModal} workout=${w} onClose=${() => setModal(null)} />`}
    ${modal === 'add' && html`<${ExercisePicker} onPick=${addExercise} onClose=${() => setModal(null)} exclude=${groups.map((g) => g.exercise_id)} />`}
  </div>`;
}
