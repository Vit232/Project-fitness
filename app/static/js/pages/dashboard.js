import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { setQuery, toastError, useQuery, useStore } from '../store.js';
import { navigate } from '../router.js';
import { WEEKDAYS_LONG, fmtCompact, fmtDate, fmtDay, fmtDuration, fmtNum, fmtSet, greeting, toDate } from '../format.js';
import { BarChart, Sparkline } from '../components/charts.js';
import { Button, EmptyState, ErrorState, Icon, PageHead, Skel, SkelList, SkelTiles, Stars, Tile } from '../components/ui.js';

function Hero({ data }) {
  const [busy, setBusy] = useState(false);
  const start = async (body) => {
    setBusy(true);
    try {
      setQuery('workout:active', await api.post('/workouts/start', body));
      navigate('/workout');
    } catch (err) {
      toastError(`Couldn't start the workout. ${err.message}`);
      setBusy(false);
    }
  };
  if (data.active_workout) {
    return html`<div class="hero">
      <div class="eyebrow">In progress</div>
      <h2>${data.active_workout.name}</h2>
      <p class="muted">You have a workout open. Pick it up where you left off.</p>
      <div style="margin-top:16px"><a class="btn primary lg" href="#/workout"><${Icon} name="play" size=${20} fill />Resume workout</a></div>
    </div>`;
  }
  const t = data.today;
  if (!t) {
    return html`<div class="hero">
      <div class="eyebrow">Get started</div>
      <h2>Build your first plan</h2>
      <p class="muted">Lay out your training days once. After that, each session is ready to start with targets and rest times filled in.</p>
      <div class="row wrap" style="margin-top:16px">
        <a class="btn primary lg" href="#/plans/new"><${Icon} name="plus" size=${20} />Create a plan</a>
        <${Button} size="lg" busy=${busy} onClick=${() => start({})}>Start an empty workout<//>
      </div>
    </div>`;
  }
  const eyebrow = t.status === 'done' ? 'Done for today' : t.status === 'today' ? "Today's workout"
    : `Rest day · next up ${t.in_days === 1 ? 'tomorrow' : WEEKDAYS_LONG[t.day.weekday]}`;
  return html`<div class="hero">
    <div class="eyebrow">${eyebrow}</div>
    <h2>${t.day.name}</h2>
    <p class="muted">${t.plan.name} · ${t.day.exercises.length} exercises · ${t.day.exercises.reduce((n, e) => n + e.target_sets, 0)} sets</p>
    <div class="hero-list">${t.day.exercises.map((e) => html`<span class="chip" key=${e.exercise_id}>${e.name}</span>`)}</div>
    <div class="row wrap">
      ${t.status === 'done'
        ? html`<span class="badge good"><${Icon} name="check" size=${14} />Logged today</span><a class="link" href="#/workout">Start another</a>`
        : html`<${Button} variant="primary" size="lg" icon="play" busy=${busy} onClick=${() => start({ plan_day_id: t.day.id })}>
            ${t.status === 'today' ? 'Start workout' : 'Start it today anyway'}<//>
          <a class="btn lg ghost" href=${`#/plans/${t.plan.id}/review`}>Review plan</a>`}
    </div>
  </div>`;
}

export function DashboardPage() {
  const { user } = useStore();
  const q = useQuery('dashboard', () => api.get('/stats/dashboard'));
  const d = q.data;
  const head = html`<${PageHead} title=${`${greeting()}, ${user.name.split(' ')[0]}`}
    sub=${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />`;

  if (!d) {
    return html`<div class="page">${head}
      ${q.error ? html`<${ErrorState} error=${q.error} onRetry=${q.reload} />` : html`<div class="stack" style="gap:16px">
        <div class="hero"><${Skel} w=${120} h=${12} /><div style="height:12px"></div><${Skel} w="45%" h=${24} /><div style="height:18px"></div><${Skel} w=${170} h=${52} r=${12} /></div>
        <${SkelTiles} /><${SkelList} rows=${4} />
      </div>`}
    </div>`;
  }

  const planned = d.planned_per_week;
  const delta = d.last_week.volume ? Math.round(((d.week.volume - d.last_week.volume) / d.last_week.volume) * 100) : null;
  const bw = d.bodyweight;
  const bwChange = bw.length > 1 ? bw[bw.length - 1].weight - bw[0].weight : null;

  return html`<div class="page">${head}
    <div class="stack" style="gap:16px">
      <${Hero} data=${d} />

      <div class="grid tiles">
        <div class="card tile">
          <div class="label"><${Icon} name="calendar" size=${14} />This week</div>
          <div class="value">${d.week.workouts}${planned ? html`<small>/ ${planned} workouts</small>` : html`<small>workouts</small>`}</div>
          ${planned ? html`<div class="dots">${Array.from({ length: planned }, (_, i) => html`<i key=${i} class=${i < d.week.workouts ? 'on' : ''}></i>`)}</div>` : null}
        </div>
        <${Tile} label="Volume this week" icon="chart" value=${fmtCompact(d.week.volume)} unit=${user.units}
          foot=${delta === null ? 'No sessions last week' : !d.week.workouts ? `Last week: ${fmtCompact(d.last_week.volume)} ${user.units}` : html`<span class=${delta >= 0 ? 'delta-up' : 'delta-down'}>${delta >= 0 ? '+' : ''}${delta}%</span> vs last week so far`} />
        <${Tile} label="Streak" icon="flame" value=${d.streak_weeks} unit=${d.streak_weeks === 1 ? 'week' : 'weeks'}
          foot="Weeks in a row with a workout" />
        <${Tile} label="All time" icon="dumbbell" value=${d.total_workouts} unit="workouts" foot=${`${d.week.sets} sets this week`} />
      </div>

      ${d.total_workouts === 0 ? html`<div class="card"><${EmptyState} icon="chart" title="Your numbers will show up here">
        Finish your first workout and this page fills in with weekly volume, records and recent sessions.<//></div>` : html`
      <div class="grid two">
        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-head"><h2>Weekly volume</h2><span class="muted small">last 8 weeks, ${user.units}</span></div>
            <${BarChart} unit=${user.units} bars=${d.weeks.map((w, i) => ({
              label: fmtDate(w.week_start).replace(/ \d{4}$/, ''),
              value: w.volume,
              dim: i === d.weeks.length - 1,
              detail: `Week of ${fmtDate(w.week_start)} · ${w.workouts} workouts${i === d.weeks.length - 1 ? ' so far' : ''}`,
            }))} />
          </div>
          <div class="card flush">
            <div class="card-head" style="padding:18px 18px 0"><h2>Recent workouts</h2><a class="link" href="#/history">See all</a></div>
            <div class="list">
              ${d.recent_workouts.map((w) => html`<a class="list-row" key=${w.id} href=${`#/history/${w.id}`}>
                <div class="date-box"><b>${toDate(w.started_at).getDate()}</b><span>${fmtDate(w.started_at).split(' ')[1]}</span></div>
                <div class="grow">
                  <div class="title truncate">${w.name}</div>
                  <div class="meta truncate">${fmtDay(w.started_at)} · ${fmtDuration(w.duration_min)} · ${w.set_count} sets · ${fmtCompact(w.volume)} ${user.units}</div>
                </div>
                <${Stars} value=${w.rating} size=${13} />
              </a>`)}
            </div>
          </div>
        </div>
        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-head"><h2>Recent records</h2><${Icon} name="trophy" /></div>
            ${d.recent_prs.length ? html`<div class="list" style="margin:0 -18px -10px">
              ${d.recent_prs.map((p) => html`<a class="list-row" key=${`${p.workout_id}-${p.exercise_id}`} href=${`#/exercises/${p.exercise_id}`}>
                <div class="grow">
                  <div class="title truncate">${p.exercise}</div>
                  <div class="meta">${fmtDay(p.date)}</div>
                </div>
                <span class="badge accent num">${fmtSet(p, p.kind, user.units)}</span>
              </a>`)}
            </div>` : html`<p class="muted small">Beat a previous best on any exercise and it lands here.</p>`}
          </div>
          <div class="card">
            <div class="card-head"><h2>Bodyweight</h2><a class="link" href="#/body">${bw.length ? 'Details' : 'Log weight'}</a></div>
            ${bw.length ? html`<div class="row">
              <div class="grow tile">
                <div class="value" style="margin-top:0">${fmtNum(bw[bw.length - 1].weight)}<small>${user.units}</small></div>
                ${bwChange !== null && html`<div class="foot">${bwChange > 0 ? '+' : ''}${fmtNum(bwChange)} ${user.units} since ${fmtDate(bw[0].date)}</div>`}
              </div>
              <${Sparkline} values=${bw.map((m) => m.weight)} width=${120} height=${44} />
            </div>` : html`<p class="muted small">Log your weight now and then to see the trend next to your training.</p>`}
          </div>
        </div>
      </div>`}
    </div>
  </div>`;
}
