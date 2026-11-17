import { html, useMemo, useState } from '../lib.js';
import { api } from '../api.js';
import { useQuery, useStore } from '../store.js';
import { daysAgo, fmtCompact, fmtDate, fmtDay, fmtDuration, fmtTime, monthLabel, toDate } from '../format.js';
import { EmptyState, ErrorState, Icon, PageHead, Segmented, SkelList, Stars } from '../components/ui.js';

export const useWorkouts = () => useQuery('workouts', () => api.get('/workouts'));

const RANGES = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All time' },
];

export function HistoryPage() {
  const { user } = useStore();
  const q = useWorkouts();
  const [range, setRange] = useState(0);
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (q.data || []).filter(
      (w) => (!range || daysAgo(w.started_at) <= range) && (w.name.toLowerCase().includes(needle) || (w.notes || '').toLowerCase().includes(needle)),
    );
    const out = [];
    for (const w of rows) {
      const label = monthLabel(w.started_at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, rows: [] });
      out[out.length - 1].rows.push(w);
    }
    return out;
  }, [q.data, range, search]);

  const total = q.data ? q.data.length : 0;
  return html`<div class="page">
    <${PageHead} title="History" sub=${q.data ? `${total} ${total === 1 ? 'workout' : 'workouts'} logged` : 'Every workout you have logged'}>
      <a class="btn primary" href="#/workout"><${Icon} name="play" size=${16} fill />Start workout</a>
    <//>
    ${q.data === undefined && (q.error ? html`<${ErrorState} error=${q.error} onRetry=${q.reload} />` : html`<${SkelList} rows=${7} />`)}
    ${q.data && !total && html`<div class="card"><${EmptyState} icon="history" title="No workouts yet"
      action=${html`<a class="btn primary" href="#/workout">Start your first workout</a>`}>
      Finished workouts are kept here so you can look back, fix a set or see how a session went.<//></div>`}
    ${q.data && total > 0 && html`
      <div class="row wrap" style="margin-bottom:6px">
        <div class="search grow" style="min-width:200px"><${Icon} name="search" />
          <input class="input" placeholder="Search by name or notes" value=${search} onInput=${(e) => setSearch(e.target.value)} /></div>
        <${Segmented} value=${range} options=${RANGES} onChange=${setRange} />
      </div>
      ${!groups.length && html`<div class="card" style="margin-top:14px"><${EmptyState} icon="search" title="No workouts match">
        Try a different search or a longer time range.<//></div>`}
      ${groups.map((g) => html`<div key=${g.label}>
        <div class="section-label">${g.label} · ${g.rows.length}</div>
        <div class="card flush"><div class="list">
          ${g.rows.map((w) => html`<a class="list-row" key=${w.id} href=${`#/history/${w.id}`}>
            <div class="date-box"><b>${toDate(w.started_at).getDate()}</b><span>${fmtDate(w.started_at).split(' ')[1]}</span></div>
            <div class="grow">
              <div class="title truncate">${w.name}</div>
              <div class="meta truncate">${fmtDay(w.started_at)} ${fmtTime(w.started_at)} · ${fmtDuration(w.duration_min)} · ${w.exercise_count} exercises · ${w.set_count} sets · ${fmtCompact(w.volume)} ${user.units}</div>
              ${w.notes && html`<div class="meta truncate" style="font-style:italic">${w.notes}</div>`}
            </div>
            <${Stars} value=${w.rating} size=${13} />
            <${Icon} name="right" size=${16} />
          </a>`)}
        </div></div>
      </div>`)}`}
  </div>`;
}
