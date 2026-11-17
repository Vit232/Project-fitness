import { html, useMemo, useState } from '../lib.js';
import { api } from '../api.js';
import { deleteWithUndo, fetchQuery, optimistic, setQuery, toast, useStore } from '../store.js';
import { EQUIPMENT, KINDS, MUSCLES } from '../format.js';
import { MuscleChips, useExercises } from '../components/exercise-picker.js';
import { Button, EmptyState, ErrorState, Field, Icon, IconButton, Modal, PageHead, SkelList } from '../components/ui.js';

const byName = (a, b) => a.name.localeCompare(b.name);

export function ExerciseForm({ exercise, onClose }) {
  const [form, setForm] = useState(exercise || { name: '', muscle_group: MUSCLES[0], equipment: EQUIPMENT[0], kind: 'weight', notes: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    onClose(); // optimistic: the list updates straight away
    const body = { name: form.name.trim(), muscle_group: form.muscle_group, equipment: form.equipment, kind: form.kind, notes: form.notes };
    if (exercise) {
      const res = await optimistic('exercises', (list) => list && list.map((e) => (e.id === exercise.id ? { ...e, ...body } : e)).sort(byName),
        () => api.patch(`/exercises/${exercise.id}`, body), `Couldn't save ${body.name}.`);
      if (res.ok) setQuery(`exercise-stats:${exercise.id}`, (s) => s && { ...s, exercise: res.data });
    } else {
      const tmp = { ...body, id: `tmp-${Date.now()}`, archived: false };
      const res = await optimistic('exercises', (list) => [...(list || []), tmp].sort(byName), () => api.post('/exercises', body), `Couldn't add ${body.name}.`);
      if (res.ok) {
        setQuery('exercises', (list) => list.map((e) => (e.id === tmp.id ? res.data : e)));
        toast(`${body.name} added`);
      }
    }
  };
  return html`<${Modal} title=${exercise ? 'Edit exercise' : 'New exercise'} onClose=${onClose} onSubmit=${save}
    footer=${html`<${Button} onClick=${onClose}>Cancel<//><${Button} type="submit" variant="primary">${exercise ? 'Save' : 'Add exercise'}<//>`}>
    <${Field} label="Name"><input class="input" required maxlength="80" placeholder="e.g. Zercher Squat" value=${form.name} onInput=${set('name')} /><//>
    <div class="form-grid">
      <${Field} label="Muscle group"><select class="input" value=${form.muscle_group} onChange=${set('muscle_group')}>
        ${[...new Set([...MUSCLES, form.muscle_group])].map((m) => html`<option key=${m} value=${m} selected=${m === form.muscle_group}>${m}</option>`)}</select><//>
      <${Field} label="Equipment"><select class="input" value=${form.equipment} onChange=${set('equipment')}>
        ${[...new Set([...EQUIPMENT, form.equipment].filter(Boolean))].map((m) => html`<option key=${m} value=${m} selected=${m === form.equipment}>${m}</option>`)}</select><//>
      <${Field} label="Tracked as" class="full"><select class="input" value=${form.kind} onChange=${set('kind')}>
        ${KINDS.map((k) => html`<option key=${k.value} value=${k.value} selected=${k.value === form.kind}>${k.label}</option>`)}</select><//>
    </div>
    <${Field} label="Notes"><textarea class="input" maxlength="2000" placeholder="Setup cues, machine settings" value=${form.notes} onInput=${set('notes')}></textarea><//>
  <//>`;
}

export function removeExercise(e) {
  deleteWithUndo({
    key: 'exercises', id: e.id, label: e.name,
    request: () => api.del(`/exercises/${e.id}`),
    onDone: (result) => {
      if (result && result.archived) {
        toast(`${e.name} has history, so it was archived instead`);
        fetchQuery('exercises');
      }
    },
  });
}

export function ExercisesPage() {
  useStore();
  const q = useExercises();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | exercise

  const all = q.data || [];
  const archivedCount = all.filter((e) => e.archived).length;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((e) => e.archived === archived && (muscle === 'All' || e.muscle_group === muscle) && e.name.toLowerCase().includes(needle));
  }, [q.data, search, muscle, archived]);

  const restore = (e) => optimistic('exercises', (list) => list.map((x) => (x.id === e.id ? { ...x, archived: false } : x)),
    () => api.patch(`/exercises/${e.id}`, { archived: false }), `Couldn't restore ${e.name}.`);

  return html`<div class="page">
    <${PageHead} title="Exercises" sub=${q.data ? `${all.length - archivedCount} in your library` : 'Your exercise library'}>
      <${Button} variant="primary" icon="plus" onClick=${() => setEditing('new')}>New exercise<//>
    <//>
    ${q.data === undefined && (q.error ? html`<${ErrorState} error=${q.error} onRetry=${q.reload} />` : html`<${SkelList} rows=${8} />`)}
    ${q.data && html`
      <div class="stack" style="gap:10px;margin-bottom:14px">
        <div class="row wrap">
          <div class="search grow" style="min-width:200px"><${Icon} name="search" />
            <input class="input" placeholder="Search exercises" value=${search} onInput=${(e) => setSearch(e.target.value)} /></div>
          ${(archivedCount > 0 || archived) && html`<${Button} icon="archive" onClick=${() => setArchived(!archived)}>
            ${archived ? 'Back to library' : `Archived (${archivedCount})`}<//>`}
        </div>
        <${MuscleChips} value=${muscle} onChange=${setMuscle} />
      </div>
      ${!rows.length ? html`<div class="card">
        ${!all.length ? html`<${EmptyState} icon="dumbbell" title="Your library is empty"
            action=${html`<${Button} variant="primary" icon="plus" onClick=${() => setEditing('new')}>Add an exercise<//>`}>
            Add the movements you train so you can put them in plans and log them.<//>`
          : archived ? html`<${EmptyState} icon="archive" title="Nothing archived">Exercises with history that you delete end up here.<//>`
          : html`<${EmptyState} icon="search" title="No exercises match"
            action=${html`<${Button} onClick=${() => { setSearch(''); setMuscle('All'); }}>Clear filters<//>`}>
            Nothing matches that search and muscle group.<//>`}
      </div>` : html`<div class="card flush"><div class="list">
        ${rows.map((e) => html`<div class=${`list-row ${typeof e.id !== 'number' ? 'pending' : ''}`} key=${e.id}>
          <a class="grow" href=${typeof e.id === 'number' ? `#/exercises/${e.id}` : undefined}>
            <div class="title truncate">${e.name}</div>
            <div class="meta truncate">${[e.muscle_group, e.equipment, e.kind === 'timed' ? 'Timed' : e.kind === 'bodyweight' ? 'Bodyweight' : ''].filter(Boolean).join(' · ')}</div>
          </a>
          ${typeof e.id === 'number' && (archived
            ? html`<${Button} size="sm" onClick=${() => restore(e)}>Restore<//>`
            : html`<${IconButton} icon="edit" label=${`Edit ${e.name}`} onClick=${() => setEditing(e)} />
                <${IconButton} icon="trash" label=${`Delete ${e.name}`} onClick=${() => removeExercise(e)} />`)}
        </div>`)}
      </div></div>`}`}
    ${editing && html`<${ExerciseForm} exercise=${editing === 'new' ? null : editing} onClose=${() => setEditing(null)} />`}
  </div>`;
}
