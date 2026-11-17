import { html } from '../lib.js';
import { api } from '../api.js';
import { useQuery, useStore } from '../store.js';
import { WEEKDAYS, fmtDate, fmtDay, fmtNum, fmtSets, fmtTarget } from '../format.js';
import { BarChart, Sparkline } from '../components/charts.js';
import { EmptyState, Icon, PageHead, Skel, SkelTiles, Tile } from '../components/ui.js';

const KIND = {
  increase: { cls: 'good', icon: 'up', label: 'Progress' },
  decrease: { cls: 'danger', icon: 'down', label: 'Ease off' },
  stale: { cls: 'warn', icon: 'alert', label: 'Skipped' },
  hold: { cls: '', icon: 'check', label: 'On track' },
  new: { cls: '', icon: 'minus', label: 'No data' },
};

export function PlanReviewPage({ id }) {
  const { user } = useStore();
  const q = useQuery(`plan-review:${id}`, () => api.get(`/stats/plan-review/${id}`));
  const r = q.data;
  const back = { href: '#/plans', label: 'Plans' };
  if (!r) {
    return html`<div class="page"><${PageHead} title="Plan review" back=${back} />
      ${q.error ? html`<div class="card"><${EmptyState} icon="alert" title="Couldn't load the review"
        action=${html`<a class="btn" href="#/plans">Back to plans</a>`}>${q.error.message}<//></div>`
      : html`<div class="stack" style="gap:16px"><${SkelTiles} n=${3} /><${Skel} h=${240} r=${14} /><${Skel} h=${320} r=${14} /></div>`}</div>`;
  }

  const head = html`<${PageHead} title=${r.plan.name} back=${back}
    sub=${[r.plan.goal, r.plan.is_active ? 'Active plan' : 'Not active'].filter(Boolean).join(' · ')}>
    <a class="btn" href=${`#/plans/${id}`}><${Icon} name="edit" size=${16} />Edit plan</a>
  <//>`;

  if (!r.total_workouts) {
    return html`<div class="page">${head}<div class="card"><${EmptyState} icon="chart" title="Nothing to review yet"
      action=${html`<a class="btn primary" href="#/workout">Start a workout</a>`}>
      Once you log workouts from this plan, this page shows how often you show up, how your lifts are moving and what to change.<//></div></div>`;
  }

  const actions = r.exercises.filter((e) => ['increase', 'decrease', 'stale'].includes(e.suggestion.kind));
  const maxMuscle = Math.max(22, ...r.muscles.map((m) => m.sets_per_week));
  const perWeek = r.weeks.slice(0, -1).filter((w) => w.done > 0);
  const avg = perWeek.length ? perWeek.reduce((n, w) => n + w.done, 0) / perWeek.length : null;

  return html`<div class="page">${head}
    <div class="stack" style="gap:16px">
      <div class="grid tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <${Tile} label="Adherence" icon="check" value=${r.adherence_pct === null ? '–' : r.adherence_pct} unit=${r.adherence_pct === null ? '' : '%'}
          foot="Planned sessions you completed" />
        <${Tile} label="Workouts" icon="dumbbell" value=${r.total_workouts} foot="Logged from this plan" />
        <${Tile} label="Per week" icon="calendar" value=${avg === null ? '–' : fmtNum(avg)} unit=${`/ ${r.days.length}`} foot="Average in weeks you trained" />
      </div>

      <div class="grid half">
        <div class="card">
          <div class="card-head"><h2>What to change</h2></div>
          ${actions.length ? actions.map((e) => html`<div class="suggest" key=${e.exercise_id}>
            <span class=${`badge ${KIND[e.suggestion.kind].cls}`}><${Icon} name=${KIND[e.suggestion.kind].icon} size=${13} />${KIND[e.suggestion.kind].label}</span>
            <div class="grow"><a href=${`#/exercises/${e.exercise_id}`} style="font-weight:600">${e.name}</a>
              <div class="small muted">${e.suggestion.text}</div></div>
          </div>`) : html`<p class="muted">Nothing needs changing right now. Every lift is moving inside its rep range, so keep adding reps.</p>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>Sessions per week</h2><span class="muted small">${r.days.length} planned</span></div>
          <${BarChart} height=${170} bars=${r.weeks.map((w, i) => ({
            label: fmtDate(w.week_start).replace(/ \d{4}$/, ''), value: w.done, ghost: w.planned, dim: i === r.weeks.length - 1,
            detail: `of ${w.planned} planned · week of ${fmtDate(w.week_start)}${i === r.weeks.length - 1 ? ' (in progress)' : ''}`,
          }))} />
        </div>
      </div>

      <div class="grid half">
        <div class="card">
          <div class="card-head"><h2>Weekly sets per muscle</h2><span class="muted small">avg, last 4 weeks</span></div>
          ${r.muscles.length ? html`
            ${r.muscles.map((m) => html`<div class="hbar" key=${m.muscle}>
              <span class="truncate">${m.muscle}</span>
              <div class="track">
                <div class="band" style=${{ left: `${(10 / maxMuscle) * 100}%`, width: `${(10 / maxMuscle) * 100}%` }}></div>
                <div class="fill" style=${{ width: `${(m.sets_per_week / maxMuscle) * 100}%` }}></div>
              </div>
              <b class="num" style="text-align:right">${fmtNum(m.sets_per_week)}</b>
            </div>`)}
            <p class="tiny muted" style="margin-top:10px">The dashed band marks 10 to 20 sets a week, a common range for muscle growth.</p>`
          : html`<p class="muted small">No finished weeks in the last month yet.</p>`}
        </div>
        <div class="card flush">
          <div class="card-head" style="padding:18px 18px 0"><h2>Training days</h2></div>
          <div class="list">${r.days.map((d) => html`<div class="list-row" key=${d.id}>
            <div class="date-box"><b style="font-size:13px">${d.weekday !== null ? WEEKDAYS[d.weekday] : 'Any'}</b></div>
            <div class="grow"><div class="title">${d.name}</div>
              <div class="meta">${d.last_done ? `Last done ${fmtDay(d.last_done).toLowerCase()}` : 'Never done'}</div></div>
            <span class="badge num">${d.done}×</span>
          </div>`)}</div>
        </div>
      </div>

      <div class="card flush">
        <div class="card-head" style="padding:18px 18px 0"><h2>Exercise progress</h2><span class="muted small">estimated 1RM, or best reps for bodyweight moves</span></div>
        <div class="scroll-x"><table class="table" style="min-width:720px">
          <thead><tr><th>Exercise</th><th>Target</th><th>Last session</th><th>Trend</th><th class="r">Change</th><th>Status</th></tr></thead>
          <tbody>${r.exercises.map((e) => html`<tr key=${e.exercise_id}>
            <td><a href=${`#/exercises/${e.exercise_id}`} style="font-weight:600">${e.name}</a><div class="tiny muted">${e.day}</div></td>
            <td class="num">${e.target_sets} × ${fmtTarget(e.rep_min, e.rep_max, e.kind)}</td>
            <td class="num small">${e.last ? fmtSets(e.last.sets, e.kind, user.units) : html`<span class="muted">–</span>`}</td>
            <td><${Sparkline} values=${e.series} /></td>
            <td class="r num">${e.change_pct === null ? html`<span class="muted">–</span>`
              : html`<span class=${e.change_pct > 0 ? 'delta-up' : e.change_pct < 0 ? 'delta-down' : 'muted'}>${e.change_pct > 0 ? '+' : ''}${e.change_pct}%</span>`}</td>
            <td><span class=${`badge ${KIND[e.suggestion.kind].cls}`} title=${e.suggestion.text}>
              <${Icon} name=${KIND[e.suggestion.kind].icon} size=${13} />${KIND[e.suggestion.kind].label}</span></td>
          </tr>`)}</tbody>
        </table></div>
      </div>
    </div>
  </div>`;
}
