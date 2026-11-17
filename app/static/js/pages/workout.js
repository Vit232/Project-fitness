// The live workout screen: tap counter, set logging and rest timer. Built phone-first.
import { html, useEffect, useRef, useState } from '../lib.js';
import { api } from '../api.js';
import { confirmDialog, fetchQuery, invalidate, optimistic, setQuery, toast, toastError, useQuery, useStore } from '../store.js';
import { navigate } from '../router.js';
import { WEEKDAYS_LONG, fmtClock, fmtDuration, fmtNum, fmtSet, fmtSets, fmtTarget, repUnit } from '../format.js';
import { useActiveWorkout, useElapsed } from '../components/layout.js';
import { ExercisePicker } from '../components/exercise-picker.js';
import { Button, EmptyState, ErrorState, Field, Icon, IconButton, Modal, Skel, Stars } from '../components/ui.js';

const KEY = 'workout:active';
const REST_KEY = 'replog.rest';

// ---------- sound & vibration ----------
let audio;
function primeAudio() {
  // must be called from a tap so the browser lets us play the beep later
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {}
}
function beep() {
  if (!audio) return;
  for (const delay of [0, 0.2]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(audio.destination);
    const t = audio.currentTime + delay;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.16);
  }
}
const buzz = (pattern) => { try { navigator.vibrate && navigator.vibrate(pattern); } catch {} };

// ---------- rest timer ----------
function useRest() {
  const [rest, setRest] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REST_KEY));
      return saved && saved.endsAt > Date.now() ? saved : null;
    } catch { return null; }
  });
  const set = (value) => {
    setRest(value);
    try { value ? localStorage.setItem(REST_KEY, JSON.stringify(value)) : localStorage.removeItem(REST_KEY); } catch {}
  };
  return [rest, set];
}

function RestBar({ rest, onChange }) {
  const [, tick] = useState(0);
  const fired = useRef(false);
  const left = (rest.endsAt - Date.now()) / 1000;
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      beep();
      buzz([200, 100, 200]);
      setTimeout(() => onChange(null), 4000);
    }
  });
  const adjust = (sec) => {
    fired.current = false;
    onChange({ endsAt: Math.max(Date.now(), rest.endsAt + sec * 1000), total: Math.max(1, rest.total + sec) });
  };
  if (left <= 0) {
    return html`<div class="rest go" role="status">
      <div class="grow"><div class="lbl">Rest over</div><div class="t">Go!</div></div>
      <button type="button" onClick=${() => onChange(null)}>Dismiss</button>
    </div>`;
  }
  return html`<div class="rest" role="timer">
    <div class="grow"><div class="lbl">Rest</div><div class="t">${fmtClock(Math.ceil(left))}</div></div>
    <button type="button" onClick=${() => adjust(-15)} aria-label="15 seconds less">−15</button>
    <button type="button" onClick=${() => adjust(15)} aria-label="15 seconds more">+15</button>
    <button type="button" onClick=${() => onChange(null)}>Skip</button>
    <div class="bar" style=${{ width: `${Math.min(100, (left / rest.total) * 100)}%` }}></div>
  </div>`;
}

// ---------- rep counter ----------
function Counter({ value, onChange, target, kind }) {
  const [startedAt, setStartedAt] = useState(null); // stopwatch for timed exercises
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => onChange(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(t);
  }, [startedAt]);
  const timed = kind === 'timed';
  const tap = () => {
    buzz(12);
    if (!timed) onChange(value + 1);
    else if (startedAt) setStartedAt(null);
    else setStartedAt(Date.now() - value * 1000);
  };
  const R = 91;
  const C = 2 * Math.PI * R;
  const progress = target ? Math.min(1, value / target) : 0;
  return html`<div class="counter-wrap">
    <button type="button" class="round" aria-label="One less" onClick=${() => onChange(Math.max(0, value - 1))}><${Icon} name="minus" size=${22} /></button>
    <button type="button" class="counter" onClick=${tap}
      aria-label=${timed ? (startedAt ? 'Stop the stopwatch' : 'Start the stopwatch') : 'Count one rep'}>
      <svg class="ring" viewBox="0 0 190 190" aria-hidden="true">
        <circle class="bg" cx="95" cy="95" r=${R} />
        <circle class="fg" cx="95" cy="95" r=${R} stroke-dasharray=${C} stroke-dashoffset=${C * (1 - progress)} />
      </svg>
      <span class="n" aria-live="polite">${value}</span>
      <span class="hint">${timed ? (startedAt ? 'Tap to stop' : value ? 'Seconds' : 'Tap to start') : value ? repUnit(kind) : 'Tap to count'}</span>
    </button>
    <button type="button" class="round" aria-label="One more" onClick=${() => onChange(value + 1)}><${Icon} name="plus" size=${22} /></button>
  </div>`;
}

// ---------- start screen ----------
function StartScreen() {
  const plans = useQuery('plans', () => api.get('/plans'));
  const [busy, setBusy] = useState(null);
  const start = async (body, id) => {
    setBusy(id);
    try {
      setQuery(KEY, await api.post('/workouts/start', body));
    } catch (err) {
      toastError(`Couldn't start the workout. ${err.message}`);
      setBusy(null);
    }
  };
  const plan = (plans.data || []).find((p) => p.is_active);
  const today = (new Date().getDay() + 6) % 7;
  return html`<div class="page narrow">
    <div class="page-head"><div class="grow">
      <h1>Start a workout</h1>
      <p class="sub">${plan ? html`From your active plan, <b>${plan.name}</b>.` : 'Pick a day from your plan, or log as you go.'}</p>
    </div></div>
    ${plans.data === undefined && !plans.error && html`<div class="stack">${[1, 2, 3].map((i) => html`<div class="card" key=${i}><${Skel} w="40%" h=${16} /><div style="height:10px"></div><${Skel} w="70%" h=${12} /></div>`)}</div>`}
    ${plans.error && plans.data === undefined && html`<${ErrorState} error=${plans.error} onRetry=${plans.reload} />`}
    ${plans.data && html`<div class="stack">
      ${plan && plan.days.map((d) => html`<div class="card" key=${d.id}>
        <div class="row">
          <div class="grow">
            <div class="row" style="gap:8px"><h2>${d.name}</h2>${d.weekday === today && html`<span class="badge accent">Today</span>`}</div>
            <p class="muted small truncate">${d.weekday !== null ? WEEKDAYS_LONG[d.weekday] + ' · ' : ''}${d.exercises.length} exercises${d.exercises.length ? ': ' + d.exercises.map((e) => e.name).join(', ') : ''}</p>
          </div>
          <${Button} variant=${d.weekday === today ? 'primary' : ''} icon="play" busy=${busy === d.id} disabled=${busy !== null}
            onClick=${() => start({ plan_day_id: d.id }, d.id)}>Start<//>
        </div>
      </div>`)}
      ${!plan && html`<div class="card"><${EmptyState} icon="plan" title="No active plan yet"
        action=${html`<a class="btn primary" href="#/plans/new">Create a plan</a>`}>
        A plan gives each session its exercises, targets and rest times, so all you do at the gym is tap.<//></div>`}
      <div class="card">
        <div class="row">
          <div class="grow"><h2>Empty workout</h2><p class="muted small">Add exercises as you go.</p></div>
          <${Button} icon="plus" busy=${busy === 'empty'} disabled=${busy !== null} onClick=${() => start({}, 'empty')}>Start empty<//>
        </div>
      </div>
    </div>`}
  </div>`;
}

// ---------- finish dialog ----------
function FinishModal({ workout, onClose, onDone }) {
  const done = workout.sets.filter((s) => s.completed);
  const open = workout.sets.length - done.length;
  const volume = done.reduce((sum, s) => sum + (s.reps || 0) * (s.weight || 0), 0);
  const { user } = useStore();
  const [rating, setRating] = useState(workout.rating);
  const [notes, setNotes] = useState(workout.notes || '');
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    try {
      await api.post(`/workouts/${workout.id}/finish`, { rating, notes });
      onDone();
    } catch (err) {
      toastError(`Couldn't finish the workout. ${err.message}`);
      setBusy(false);
    }
  };
  return html`<${Modal} title="Finish workout" onClose=${onClose} onSubmit=${finish}
    footer=${html`<${Button} onClick=${onClose}>Keep going<//>
      <${Button} type="submit" variant="primary" icon="check" busy=${busy} disabled=${!done.length}>Save workout<//>`}>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      <div><div class="tile"><div class="value" style="font-size:22px">${fmtDuration(Math.round((Date.now() - new Date(workout.started_at)) / 60000))}</div></div><div class="tiny muted">Time</div></div>
      <div><div class="tile"><div class="value" style="font-size:22px">${done.length}</div></div><div class="tiny muted">Sets</div></div>
      <div><div class="tile"><div class="value" style="font-size:22px">${fmtNum(volume, 0)}</div></div><div class="tiny muted">Volume (${user.units})</div></div>
    </div>
    ${!done.length && html`<p class="form-error">Log at least one set first, or discard the workout from the menu.</p>`}
    ${open > 0 && done.length > 0 && html`<p class="muted small">${open} unfinished ${open === 1 ? 'set' : 'sets'} will be left out.</p>`}
    <${Field} label="How did it go?"><${Stars} value=${rating} onChange=${setRating} size=${26} /><//>
    <${Field} label="Notes"><textarea class="input" maxlength="2000" placeholder="Anything worth remembering next time"
      value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea><//>
  <//>`;
}

// ---------- the live screen ----------
function Live({ workout }) {
  const { user } = useStore();
  const elapsed = useElapsed(workout.started_at);
  const [selId, setSelId] = useState(null);
  const [exId, setExId] = useState(null);
  const [reps, setReps] = useState(0);
  const [weight, setWeight] = useState(null);
  const [rest, setRest] = useRest();
  const [modal, setModal] = useState(null);
  const step = user.units === 'kg' ? 2.5 : 5;

  // keep the screen awake while lifting, where the browser allows it
  useEffect(() => {
    let lock;
    const acquire = async () => {
      try { if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch {}
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  const groups = workout.exercises.map((ex) => ({ ...ex, sets: workout.sets.filter((s) => s.exercise_id === ex.exercise_id) }));
  const sel = workout.sets.find((s) => s.id === selId)
    || (exId && workout.sets.find((s) => !s.completed && s.exercise_id === exId))
    || (!exId && workout.sets.find((s) => !s.completed))
    || null;
  const group = (sel && groups.find((g) => g.exercise_id === sel.exercise_id)) || groups.find((g) => g.exercise_id === exId) || groups[groups.length - 1];
  const saving = sel && typeof sel.id !== 'number';
  const allDone = workout.sets.length > 0 && workout.sets.every((s) => s.completed);

  useEffect(() => {
    if (!sel) return;
    setReps(sel.reps ?? 0);
    setWeight(sel.weight);
  }, [sel && sel.id]);

  const patchLocal = (fn) => (w) => (w ? { ...w, sets: fn(w.sets) } : w);

  function selectExercise(g) {
    setExId(g.exercise_id);
    const next = g.sets.find((s) => !s.completed) || g.sets[g.sets.length - 1];
    setSelId(next ? next.id : null);
  }

  function logSet() {
    primeAudio();
    const wasDone = sel.completed;
    const body = { reps, weight: group.kind === 'weight' ? weight ?? 0 : weight, completed: true };
    const next = group.sets.find((s) => !s.completed && s.id !== sel.id) || workout.sets.find((s) => !s.completed && s.id !== sel.id) || null;
    optimistic(
      KEY,
      patchLocal((sets) => sets.map((s) => {
        if (s.id === sel.id) return { ...s, ...body };
        // carry a changed weight forward to the sets still to come
        if (!wasDone && !s.completed && s.exercise_id === sel.exercise_id) return { ...s, weight: body.weight };
        return s;
      })),
      () => api.patch(`/workouts/sets/${sel.id}`, body),
      "Couldn't save that set.",
    ).then((res) => {
      if (res.ok) {
        // save the carried-forward weight too, so it survives a refresh
        if (!wasDone) {
          group.sets
            .filter((s) => !s.completed && s.id !== sel.id && typeof s.id === 'number' && s.weight !== body.weight)
            .forEach((s) => api.patch(`/workouts/sets/${s.id}`, { weight: body.weight }).catch(() => {}));
        }
        return;
      }
      // the save failed and was rolled back: bring the lifter back to that set
      setSelId(sel.id);
      setExId(sel.exercise_id);
      setRest(null);
    });
    buzz(30);
    setSelId(next ? next.id : null);
    setExId(next ? next.exercise_id : group.exercise_id);
    if (!wasDone && next) setRest({ endsAt: Date.now() + group.rest_sec * 1000, total: group.rest_sec });
  }

  function undoSet(s) {
    optimistic(KEY, patchLocal((sets) => sets.map((x) => (x.id === s.id ? { ...x, completed: false } : x))),
      () => api.patch(`/workouts/sets/${s.id}`, { completed: false }), "Couldn't update that set.");
  }

  async function addSet(g) {
    const last = g.sets[g.sets.length - 1];
    const tmp = {
      id: `tmp-${Date.now()}`, exercise_id: g.exercise_id, position: last ? last.position : 0,
      set_number: g.sets.length + 1, target_min: last ? last.target_min : null, target_max: last ? last.target_max : null,
      reps: null, weight: last ? last.weight : null, is_warmup: false, completed: false,
    };
    const res = await optimistic(KEY, patchLocal((sets) => [...sets, tmp]),
      () => api.post(`/workouts/${workout.id}/sets`, { exercise_id: g.exercise_id }), "Couldn't add a set.");
    if (res.ok) setQuery(KEY, patchLocal((sets) => sets.map((s) => (s.id === tmp.id ? res.data[0] : s))));
  }

  function deleteSet(s) {
    if (s.id === selId) setSelId(null);
    optimistic(
      KEY,
      patchLocal((sets) => {
        let n = 0;
        return sets.filter((x) => x.id !== s.id).map((x) => (x.exercise_id === s.exercise_id ? { ...x, set_number: ++n } : x));
      }),
      () => api.del(`/workouts/sets/${s.id}`),
      "Couldn't remove that set.",
    );
  }

  async function addExercise(ex) {
    setModal(null);
    try {
      const created = await api.post(`/workouts/${workout.id}/sets`, { exercise_id: ex.id, count: 3 });
      await fetchQuery(KEY);
      setExId(ex.id);
      setSelId(created[0].id);
    } catch (err) {
      toastError(`Couldn't add ${ex.name}. ${err.message}`);
    }
  }

  async function removeExercise(g) {
    setModal(null);
    const ok = await confirmDialog({
      title: `Remove ${g.name}?`, body: 'Its sets in this workout will be removed, including any you already logged.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    setSelId(null);
    setExId(null);
    optimistic(
      KEY,
      (w) => w && { ...w, exercises: w.exercises.filter((e) => e.exercise_id !== g.exercise_id), sets: w.sets.filter((s) => s.exercise_id !== g.exercise_id) },
      () => api.del(`/workouts/${workout.id}/exercises/${g.exercise_id}`),
      `Couldn't remove ${g.name}.`,
    );
  }

  async function discard() {
    setModal(null);
    const ok = await confirmDialog({
      title: 'Discard this workout?', body: 'Everything logged in this session will be deleted. This cannot be undone.',
      confirmLabel: 'Discard workout', danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/workouts/${workout.id}`);
      setRest(null);
      setQuery(KEY, null);
      toast('Workout discarded');
    } catch (err) {
      toastError(`Couldn't discard the workout. ${err.message}`);
    }
  }

  function finished() {
    setRest(null);
    setQuery(KEY, null);
    invalidate('workouts', 'dashboard', 'plan-review', 'exercise-stats');
    toast('Workout saved. Nice work.');
    navigate(`/history/${workout.id}`);
  }

  const quick = [];
  if (sel && group.kind !== 'timed' && sel.target_min && sel.target_max && sel.target_max - sel.target_min <= 5) {
    for (let n = sel.target_min; n <= sel.target_max; n++) quick.push(n);
  }

  return html`<div class="live">
    <div class="live-head">
      <div class="grow">
        <h1 class="truncate">${workout.name}</h1>
        <div class="clock"><${Icon} name="timer" size=${14} /> ${fmtClock(elapsed)}</div>
      </div>
      <${IconButton} icon="more" label="Workout options" size="" onClick=${() => setModal('menu')} />
      <${Button} variant=${allDone ? 'primary' : ''} icon="check" onClick=${() => setModal('finish')}>Finish<//>
    </div>

    ${!groups.length && html`<div class="live-card"><${EmptyState} icon="dumbbell" title="Add your first exercise"
      action=${html`<${Button} variant="primary" icon="plus" onClick=${() => setModal('add')}>Add exercise<//>`}>
      Pick something from your library and start counting.<//></div>`}

    ${groups.length > 0 && html`
      <div class="ex-tabs" role="tablist">
        ${groups.map((g) => {
          const doneCount = g.sets.filter((s) => s.completed).length;
          return html`<button type="button" key=${g.exercise_id} role="tab" aria-selected=${g === group}
            class=${`ex-tab ${g === group ? 'on' : ''} ${g.sets.length && doneCount === g.sets.length ? 'done' : ''}`} onClick=${() => selectExercise(g)}>
            <b class="truncate">${g.name}</b>
            <span class="tiny muted">${doneCount}/${g.sets.length} sets</span>
            <span class="pips">${g.sets.map((s) => html`<i key=${s.id} class=${s.completed ? 'on' : ''}></i>`)}</span>
          </button>`;
        })}
        <button type="button" class="ex-tab" style="min-width:auto;display:grid;place-items:center" aria-label="Add exercise" onClick=${() => setModal('add')}>
          <${Icon} name="plus" /></button>
      </div>

      <div class="live-card">
        <div class="row" style="align-items:flex-start">
          <div class="grow">
            <div class="tiny muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em">
              ${sel ? `Set ${sel.set_number} of ${group.sets.length}${sel.completed ? ' · logged' : ''}` : group.muscle_group}
            </div>
            <div class="live-title">${group.name}</div>
          </div>
          ${sel && (sel.target_min || sel.target_max) && html`<span class="badge accent">Target ${fmtTarget(sel.target_min, sel.target_max, group.kind)}</span>`}
        </div>
        <p class="muted small" style="margin-top:4px">
          ${group.previous.length ? `Last time: ${fmtSets(group.previous, group.kind, user.units)}` : 'First time logging this exercise.'}
        </p>

        ${sel ? html`
          <${Counter} key=${sel.id} value=${reps} onChange=${setReps} target=${sel.target_max} kind=${group.kind} />
          ${quick.length > 0 && html`<div class="quick" aria-label="Quick pick reps">
            ${quick.map((n) => html`<button type="button" key=${n} class=${n === reps ? 'on' : ''} onClick=${() => setReps(n)}>${n}</button>`)}
          </div>`}
          ${group.kind === 'weight' && html`<div class="weight-row">
            <button type="button" class="round" aria-label=${`${step} ${user.units} less`} onClick=${() => setWeight(Math.max(0, (weight || 0) - step))}><${Icon} name="minus" /></button>
            <input type="number" inputmode="decimal" step="any" min="0" aria-label="Weight" placeholder="0"
              value=${weight ?? ''} onFocus=${(e) => e.target.select()}
              onInput=${(e) => setWeight(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
            <span class="unit">${user.units}</span>
            <button type="button" class="round" aria-label=${`${step} ${user.units} more`} onClick=${() => setWeight((weight || 0) + step)}><${Icon} name="plus" /></button>
          </div>`}
          <${Button} variant="primary" size="lg" class="block" icon="check" disabled=${reps < 1 || saving} onClick=${logSet}>
            ${saving ? 'Saving…' : sel.completed ? 'Update set' : `Log set ${sel.set_number}`}<//>
          ${sel.completed && html`<div style="text-align:center;margin-top:10px">
            <button type="button" class="link" onClick=${() => undoSet(sel)}>Mark as not done</button></div>`}
        ` : html`<div class="empty" style="padding:26px 10px 14px">
          <div class="ico" style="background:var(--accent);color:var(--accent-ink)"><${Icon} name="check" size=${26} /></div>
          <h2>${allDone ? 'Every set logged' : `${group.name} is done`}</h2>
          <p>${allDone ? 'Finish the workout, or add more if you have something left.' : 'Pick the next exercise above, or add another set.'}</p>
          ${allDone && html`<${Button} variant="primary" size="lg" icon="check" onClick=${() => setModal('finish')}>Finish workout<//>`}
        </div>`}

        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:10px">
          ${group.sets.map((s) => html`<div key=${s.id} class=${`row ${typeof s.id !== 'number' ? 'pending' : ''}`} style="gap:4px">
            <button type="button" class=${`set-row grow ${s.completed ? 'done' : ''} ${sel && s.id === sel.id ? 'on' : ''}`}
              onClick=${() => { setExId(group.exercise_id); setSelId(s.id); }}>
              <span class="set-no">${s.completed ? html`<${Icon} name="check" size=${14} />` : s.set_number}</span>
              ${s.completed
                ? html`<span class="grow num" style="font-weight:650">${fmtSet(s, group.kind, user.units)}</span>`
                : html`<span class="grow muted num">${[fmtTarget(s.target_min, s.target_max, group.kind), s.weight ? `${fmtNum(s.weight)} ${user.units}` : ''].filter(Boolean).join(' · ') || 'Not done yet'}</span>`}
            </button>
            <${IconButton} icon="trash" label=${`Remove set ${s.set_number}`} disabled=${typeof s.id !== 'number'} onClick=${() => deleteSet(s)} />
          </div>`)}
          <${Button} variant="ghost" size="sm" icon="plus" class="block" style="margin-top:6px" onClick=${() => addSet(group)}>Add set<//>
        </div>
      </div>`}

    ${rest && html`<${RestBar} rest=${rest} onChange=${setRest} />`}
    ${modal === 'add' && html`<${ExercisePicker} onPick=${addExercise} onClose=${() => setModal(null)}
      exclude=${groups.map((g) => g.exercise_id)} />`}
    ${modal === 'finish' && html`<${FinishModal} workout=${workout} onClose=${() => setModal(null)} onDone=${finished} />`}
    ${modal === 'menu' && html`<${Modal} title="Workout options" onClose=${() => setModal(null)}>
      <div style="margin:-6px -8px 0">
        <button type="button" class="nav-link" onClick=${() => setModal('add')}><${Icon} name="plus" />Add exercise</button>
        ${group && html`<button type="button" class="nav-link" onClick=${() => removeExercise(group)}><${Icon} name="minus" />Remove ${group.name}</button>`}
        <button type="button" class="nav-link" style="color:var(--danger)" onClick=${discard}><${Icon} name="trash" />Discard workout</button>
      </div>
    <//>`}
  </div>`;
}

export function WorkoutPage() {
  const q = useActiveWorkout();
  if (q.data === undefined) {
    if (q.error) return html`<div class="page narrow"><${ErrorState} error=${q.error} onRetry=${q.reload} /></div>`;
    return html`<div class="live" aria-busy="true">
      <${Skel} w="50%" h=${24} /><div style="height:16px"></div>
      <div class="row">${[1, 2, 3].map((i) => html`<${Skel} key=${i} w=${120} h=${62} r=${12} />`)}</div>
      <div style="height:16px"></div><${Skel} h=${420} r=${18} />
    </div>`;
  }
  return q.data ? html`<${Live} workout=${q.data} />` : html`<${StartScreen} />`;
}
