import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { useQuery, useStore } from '../store.js';
import { fmtCompact, fmtDate, fmtDay, fmtNum, fmtSets, repUnit } from '../format.js';
import { LineChart } from '../components/charts.js';
import { Button, EmptyState, PageHead, Segmented, Skel, SkelTiles, Tile } from '../components/ui.js';
import { ExerciseForm } from './exercises.js';

export function ExerciseDetailPage({ id }) {
  const { user } = useStore();
  const q = useQuery(`exercise-stats:${id}`, () => api.get(`/stats/exercise/${id}`));
  const [metric, setMetric] = useState(null);
  const [editing, setEditing] = useState(false);
  const back = { href: '#/exercises', label: 'Exercises' };
  const d = q.data;
  if (!d) {
    return html`<div class="page"><${PageHead} title="Exercise" back=${back} />
      ${q.error ? html`<div class="card"><${EmptyState} icon="alert" title="Exercise not found"
        action=${html`<a class="btn" href="#/exercises">Back to exercises</a>`}>${q.error.message}<//></div>`
      : html`<div class="stack" style="gap:16px" aria-busy="true"><${SkelTiles} /><${Skel} h=${260} r=${14} /></div>`}</div>`;
  }
  const ex = d.exercise;
  const loaded = ex.kind === 'weight';
  const unit = repUnit(ex.kind);
  const metrics = loaded
    ? [{ value: 'e1rm', label: 'Est. 1RM' }, { value: 'top_weight', label: 'Top weight' }, { value: 'volume', label: 'Volume' }]
    : [{ value: 'top_reps', label: `Best ${unit}` }];
  const m = metric || metrics[0].value;
  const r = d.records;

  return html`<div class="page">
    <${PageHead} title=${ex.name} back=${back}
      sub=${[ex.muscle_group, ex.equipment, ex.archived ? 'Archived' : ''].filter(Boolean).join(' · ')}>
      <${Button} icon="edit" onClick=${() => setEditing(true)}>Edit<//>
    <//>
    <div class="stack" style="gap:16px">
      ${ex.notes && html`<div class="card"><h3 class="muted" style="margin-bottom:4px">Notes</h3><p style="white-space:pre-wrap">${ex.notes}</p></div>`}
      ${!r ? html`<div class="card"><${EmptyState} icon="chart" title="No sessions yet"
        action=${html`<a class="btn primary" href="#/workout">Start a workout</a>`}>
        Log this exercise in a workout and its records and progress chart appear here.<//></div>` : html`
        <div class="grid tiles">
          ${loaded && html`<${Tile} label="Heaviest" icon="trophy" value=${fmtNum(r.top_weight)} unit=${user.units} />`}
          ${loaded && html`<${Tile} label="Est. 1RM" icon="up" value=${fmtNum(r.e1rm)} unit=${user.units} foot="Best set, Epley formula" />`}
          <${Tile} label=${`Most ${unit}`} icon="flame" value=${r.top_reps} unit=${`in a set`} />
          ${loaded && html`<${Tile} label="Best volume" icon="chart" value=${fmtCompact(r.volume)} unit=${user.units} foot="In one session" />`}
          ${!loaded && html`<${Tile} label="Sessions" icon="calendar" value=${r.sessions} />`}
        </div>
        <div class="card">
          <div class="card-head"><h2 class="grow">Progress</h2>
            ${metrics.length > 1 && html`<${Segmented} value=${m} options=${metrics} onChange=${setMetric} />`}</div>
          <${LineChart} height=${240} unit=${loaded ? user.units : unit}
            points=${d.sessions.map((s) => ({ label: fmtDate(s.date).replace(/ \d{4}$/, ''), value: s[m], detail: `${fmtDate(s.date)} · ${fmtSets(s.sets, ex.kind, user.units)}` }))} />
        </div>
        <div class="card flush">
          <div class="card-head" style="padding:18px 18px 0"><h2>Sessions</h2><span class="muted small">${r.sessions} total</span></div>
          <div class="list">
            ${[...d.sessions].reverse().slice(0, 20).map((s) => html`<a class="list-row" key=${s.workout_id} href=${`#/history/${s.workout_id}`}>
              <div class="grow"><div class="title num">${fmtSets(s.sets, ex.kind, user.units)}</div><div class="meta">${fmtDay(s.date)}</div></div>
              ${loaded && html`<span class="badge num">1RM ${fmtNum(s.e1rm)}</span>`}
            </a>`)}
          </div>
        </div>`}
    </div>
    ${editing && html`<${ExerciseForm} exercise=${ex} onClose=${() => setEditing(false)} />`}
  </div>`;
}
