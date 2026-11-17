export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full body'];
export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Kettlebell', 'Bodyweight', 'Other'];
export const KINDS = [
  { value: 'weight', label: 'Weight × reps' },
  { value: 'bodyweight', label: 'Bodyweight reps' },
  { value: 'timed', label: 'Timed (seconds)' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** Parses '2026-11-16' as a local date (new Date() would read it as UTC). */
export function toDate(v) {
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(v);
}
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoLocal = (d) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function daysAgo(v) {
  const d = toDate(v);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((b - a) / 86400000);
}
export function fmtDate(v, { year = false } = {}) {
  const d = toDate(v);
  const showYear = year || d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`;
}
export function fmtDay(v) {
  const n = daysAgo(v);
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  const d = toDate(v);
  return `${WEEKDAYS[(d.getDay() + 6) % 7]} ${fmtDate(d)}`;
}
export const fmtTime = (v) => {
  const d = toDate(v);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const monthLabel = (v) => {
  const d = toDate(v);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;
};
export const monthShort = (v) => MONTHS[toDate(v).getMonth()];

export function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || n === '') return '–';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
}
export function fmtCompact(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return fmtNum(n, 0);
}
export function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${pad(min % 60)}m`;
}
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const repUnit = (kind) => (kind === 'timed' ? 'sec' : 'reps');

/** "60 kg × 8" / "8 reps" / "45 sec" */
export function fmtSet(s, kind, units) {
  const reps = s.reps ?? '–';
  if (kind === 'weight' || s.weight) return `${fmtNum(s.weight ?? 0)} ${units} × ${reps}`;
  return `${reps} ${repUnit(kind)}`;
}

/** Compact line for a list of sets: "60 kg × 8 · 8 · 7" when the weight is constant. */
export function fmtSets(sets, kind, units) {
  if (!sets || !sets.length) return '';
  const weights = new Set(sets.map((s) => s.weight ?? 0));
  const reps = sets.map((s) => s.reps ?? '–').join(' · ');
  if (kind !== 'weight' && !sets.some((s) => s.weight)) return `${reps} ${repUnit(kind)}`;
  if (weights.size === 1) return `${fmtNum(sets[0].weight ?? 0)} ${units} × ${reps}`;
  return sets.map((s) => `${fmtNum(s.weight ?? 0)}×${s.reps ?? '–'}`).join(', ');
}

export function fmtTarget(min, max, kind) {
  if (!min && !max) return '';
  const range = min === max || !max ? `${min}` : `${min}–${max}`;
  return `${range} ${repUnit(kind)}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late session' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
