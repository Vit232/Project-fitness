import { html, useMemo, useState } from '../lib.js';
import { api } from '../api.js';
import { useQuery } from '../store.js';
import { MUSCLES } from '../format.js';
import { EmptyState, Icon, Modal, Skel } from './ui.js';

export const useExercises = () => useQuery('exercises', () => api.get('/exercises'));

export function MuscleChips({ value, onChange }) {
  return html`<div class="chips">
    ${['All', ...MUSCLES].map((m) => html`<button type="button" key=${m}
      class=${`chip ${value === m ? 'on' : ''}`} onClick=${() => onChange(m)}>${m}</button>`)}
  </div>`;
}

export function ExercisePicker({ onPick, onClose, exclude = [], title = 'Add exercise' }) {
  const { data } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('All');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter(
      (e) => !e.archived && (muscle === 'All' || e.muscle_group === muscle) && e.name.toLowerCase().includes(needle),
    );
  }, [data, q, muscle]);
  return html`<${Modal} title=${title} onClose=${onClose} wide>
    <div class="search"><${Icon} name="search" />
      <input class="input" placeholder="Search exercises" value=${q} onInput=${(e) => setQ(e.target.value)}
        onKeyDown=${(e) => e.key === 'Enter' && e.preventDefault() /* the picker can sit inside a form; Enter must not submit it */} />
    </div>
    <${MuscleChips} value=${muscle} onChange=${setMuscle} />
    <div class="list" style="margin: 0 -18px; min-height: 240px">
      ${!data && [1, 2, 3, 4].map((i) => html`<div class="list-row" key=${i}><${Skel} w=${`${35 + i * 9}%`} h=${14} /></div>`)}
      ${data && !rows.length && html`<${EmptyState} icon="search" title="No matches">
        Nothing in your library matches that. You can add new exercises on the Exercises page.<//>`}
      ${rows.map((e) => {
        const used = exclude.includes(e.id);
        return html`<button type="button" key=${e.id} class="list-row click" disabled=${used}
          style="border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;width:100%"
          onClick=${() => onPick(e)}>
          <div class="grow"><div class="title">${e.name}</div><div class="meta">${e.muscle_group} · ${e.equipment || 'No equipment'}</div></div>
          ${used ? html`<span class="badge">Added</span>` : html`<${Icon} name="plus" />`}
        </button>`;
      })}
    </div>
  <//>`;
}
