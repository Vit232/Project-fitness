import { html, useState } from '../lib.js';
import { api } from '../api.js';
import { deleteWithUndo, invalidate, optimistic, setQuery, useQuery, useStore } from '../store.js';
import { daysAgo, fmtDate, fmtDay, fmtNum, isoDate } from '../format.js';
import { LineChart } from '../components/charts.js';
import { Button, EmptyState, ErrorState, Field, IconButton, Modal, PageHead, SkelList, Tile } from '../components/ui.js';

const KEY = 'measurements';
const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const toBody = (f) => ({ date: f.date, weight: Number(f.weight), body_fat: f.body_fat === '' || f.body_fat === null ? null : Number(f.body_fat), notes: f.notes || '' });

function EntryFields({ form, setForm, units }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return html`
    <${Field} label="Date"><input class="input" type="date" required max=${isoDate()} value=${form.date} onInput=${set('date')} /><//>
    <${Field} label=${`Weight (${units})`}><input class="input" type="number" inputmode="decimal" step="0.1" min="1" max="1000" required
      placeholder="0.0" value=${form.weight} onInput=${set('weight')} /><//>
    <${Field} label="Body fat % (optional)"><input class="input" type="number" inputmode="decimal" step="0.1" min="1" max="75"
      value=${form.body_fat ?? ''} onInput=${set('body_fat')} /><//>
    <${Field} label="Note (optional)"><input class="input" maxlength="500" value=${form.notes} onInput=${set('notes')} /><//>`;
}

function EditModal({ entry, units, onClose }) {
  const [form, setForm] = useState({ ...entry });
  const save = async () => {
    onClose();
    const body = toBody(form);
    const res = await optimistic(KEY, (list) => list.map((m) => (m.id === entry.id ? { ...m, ...body } : m)).sort(newestFirst),
      () => api.put(`/measurements/${entry.id}`, body), "Couldn't save that entry.");
    if (res.ok) invalidate('dashboard');
  };
  return html`<${Modal} title="Edit entry" onClose=${onClose} onSubmit=${save}
    footer=${html`<${Button} onClick=${onClose}>Cancel<//><${Button} type="submit" variant="primary">Save<//>`}>
    <div class="form-grid"><${EntryFields} form=${form} setForm=${setForm} units=${units} /></div>
  <//>`;
}

export function BodyPage() {
  const { user } = useStore();
  const q = useQuery(KEY, () => api.get('/measurements'));
  const empty = () => ({ date: isoDate(), weight: '', body_fat: '', notes: '' });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  async function add(e) {
    e.preventDefault();
    const body = toBody(form);
    const tmp = { ...body, id: `tmp-${Date.now()}` };
    setForm(empty());
    const res = await optimistic(KEY, (list) => [tmp, ...(list || [])].sort(newestFirst), () => api.post('/measurements', body), "Couldn't save that entry.");
    if (res.ok) {
      setQuery(KEY, (list) => list.map((m) => (m.id === tmp.id ? res.data : m)));
      invalidate('dashboard');
    } else setForm(form); // give the typed values back
  }
  const remove = (m) => deleteWithUndo({
    key: KEY, id: m.id, label: `the entry for ${fmtDate(m.date)}`,
    request: () => api.del(`/measurements/${m.id}`), onDone: () => invalidate('dashboard'),
  });

  const list = q.data || [];
  const latest = list[0];
  const monthAgo = list.find((m) => daysAgo(m.date) >= 28);
  const change = latest && monthAgo ? latest.weight - monthAgo.weight : null;
  const chart = [...list].reverse().slice(-60);

  return html`<div class="page">
    <${PageHead} title="Body" sub="Track your bodyweight next to your training." />
    <div class="stack" style="gap:16px">
      <form class="card" onSubmit=${add}>
        <div class="card-head"><h2>Log today's weight</h2></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end">
          <${EntryFields} form=${form} setForm=${setForm} units=${user.units} />
          <${Button} type="submit" variant="primary" icon="plus" style="min-height:40px">Add entry<//>
        </div>
      </form>

      ${q.data === undefined && (q.error ? html`<${ErrorState} error=${q.error} onRetry=${q.reload} />` : html`<${SkelList} rows=${5} />`)}
      ${q.data && !list.length && html`<div class="card"><${EmptyState} icon="scale" title="No entries yet">
        Add your weight above. Two or three entries a week is enough to see a clear trend.<//></div>`}
      ${list.length > 0 && html`
        <div class="grid tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <${Tile} label="Current" icon="scale" value=${fmtNum(latest.weight)} unit=${user.units} foot=${fmtDay(latest.date)} />
          <${Tile} label="Last 4 weeks" icon=${change !== null && change > 0 ? 'up' : 'down'}
            value=${change === null ? '–' : `${change > 0 ? '+' : ''}${fmtNum(change)}`} unit=${change === null ? '' : user.units}
            foot=${monthAgo ? `Since ${fmtDate(monthAgo.date)}` : 'Needs a month of entries'} />
          <${Tile} label="Entries" icon="list" value=${list.length} foot=${`Since ${fmtDate(list[list.length - 1].date)}`} />
        </div>
        ${chart.length > 1 && html`<div class="card">
          <div class="card-head"><h2>Trend</h2><span class="muted small">${user.units}</span></div>
          <${LineChart} height=${230} unit=${user.units}
            points=${chart.map((m) => ({ label: fmtDate(m.date).replace(/ \d{4}$/, ''), value: m.weight, detail: fmtDate(m.date) + (m.body_fat ? ` · ${fmtNum(m.body_fat)}% body fat` : '') }))} />
        </div>`}
        <div class="card flush"><div class="scroll-x"><table class="table">
          <thead><tr><th>Date</th><th class="r">Weight</th><th class="r">Body fat</th><th>Note</th><th></th></tr></thead>
          <tbody>${list.map((m) => html`<tr key=${m.id} class=${typeof m.id !== 'number' ? 'pending' : ''}>
            <td style="white-space:nowrap">${fmtDay(m.date)}</td>
            <td class="r num"><b>${fmtNum(m.weight)}</b> ${user.units}</td>
            <td class="r num">${m.body_fat ? `${fmtNum(m.body_fat)}%` : html`<span class="muted">–</span>`}</td>
            <td class="muted small">${m.notes}</td>
            <td class="r" style="white-space:nowrap">${typeof m.id === 'number' && html`
              <${IconButton} icon="edit" label="Edit entry" onClick=${() => setEditing(m)} />
              <${IconButton} icon="trash" label="Delete entry" onClick=${() => remove(m)} />`}</td>
          </tr>`)}</tbody>
        </table></div></div>`}
    </div>
    ${editing && html`<${EditModal} entry=${editing} units=${user.units} onClose=${() => setEditing(null)} />`}
  </div>`;
}
