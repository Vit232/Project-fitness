import { html, useEffect, useRef, useState } from '../lib.js';
import { useStore } from '../store.js';

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  dumbbell: 'M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11',
  plan: 'M8 4h8M9 2.5h6v3H9zM6 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-1M8 11h8M8 15h5',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4h4M12 7.5V12l3 2',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  scale: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 9.5a5 5 0 0 1 7 0M12 9.5l1.5-2',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  play: 'M7 4.5v15l12-7.5z',
  right: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3 0-5.500 1-8.500z',
  timer: 'M12 8v5l3 2M9 2.500h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  logout: 'M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M15 16l4-4-4-4M19 12H9',
  star: 'M12 3.5l2.6 5.4 5.900.8-4.300 4.100 1 5.900L12 16.900 6.800 19.700l1-5.900L3.500 9.700l5.900-.8z',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  alert: 'M12 4 2.500 20h19L12 4zM12 10v4.500M12 17.500h.01',
};

export function Icon({ name, size = 18, fill = false }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill=${fill ? 'currentColor' : 'none'}
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d=${ICONS[name]} />
  </svg>`;
}

export function Button({ variant = '', size = '', icon, busy, disabled, children, class: cls = '', ...rest }) {
  return html`<button type="button" ...${rest} class=${`btn ${variant} ${size} ${cls}`} disabled=${busy || disabled}>
    ${busy ? html`<span class="spinner"></span>` : icon && html`<${Icon} name=${icon} size=${size === 'lg' ? 20 : 16} />`}
    ${children}
  </button>`;
}

export function IconButton({ icon, label, size = 'sm', ...rest }) {
  return html`<button type="button" class=${`btn ghost icon ${size}`} aria-label=${label} title=${label} ...${rest}>
    <${Icon} name=${icon} size=${16} />
  </button>`;
}

export function Field({ label, children, class: cls = '' }) {
  return html`<label class=${`field ${cls}`}><span>${label}</span>${children}</label>`;
}

export function Segmented({ value, options, onChange }) {
  return html`<div class="seg" role="tablist">
    ${options.map((o) => html`<button type="button" role="tab" aria-selected=${o.value === value}
      class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Stars({ value, onChange, size = 15 }) {
  return html`<span class="stars" aria-label=${value ? `${value} out of 5` : 'Not rated'}>
    ${[1, 2, 3, 4, 5].map((n) => {
      const star = html`<span class=${n <= (value || 0) ? 'on' : ''}><${Icon} name="star" size=${size} fill=${n <= (value || 0)} /></span>`;
      return onChange
        ? html`<button type="button" aria-label=${`${n} stars`} onClick=${() => onChange(n === value ? null : n)}>${star}</button>`
        : star;
    })}
  </span>`;
}

export function Modal({ title, onClose, children, footer, wide, onSubmit }) {
  const ref = useRef();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    const el = ref.current && ref.current.querySelector('[autofocus], input, select, textarea');
    if (el && matchMedia('(min-width: 600px)').matches) el.focus();
    return () => removeEventListener('keydown', onKey);
  }, []);
  const body = html`
    <div class="modal-head">
      <h2>${title}</h2>
      <${IconButton} icon="x" label="Close" onClick=${onClose} />
    </div>
    <div class="modal-body">${children}</div>
    ${footer && html`<div class="modal-foot">${footer}</div>`}`;
  return html`<div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    ${onSubmit
      ? html`<form ref=${ref} class=${`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true"
          onSubmit=${(e) => { e.preventDefault(); onSubmit(); }}>${body}</form>`
      : html`<div ref=${ref} class=${`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">${body}</div>`}
  </div>`;
}

export function ConfirmHost() {
  const { confirm } = useStore();
  if (!confirm) return null;
  return html`<${Modal} title=${confirm.title} onClose=${() => confirm.resolve(false)}
    footer=${html`
      <${Button} onClick=${() => confirm.resolve(false)}>Cancel<//>
      <${Button} variant=${confirm.danger ? 'danger' : 'primary'} onClick=${() => confirm.resolve(true)}>${confirm.confirmLabel || 'Confirm'}<//>`}>
    <p class="muted">${confirm.body}</p>
  <//>`;
}

export function Toasts() {
  const { toasts } = useStore();
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>
      <span class="grow">${t.text}</span>
      ${t.action && html`<button type="button" onClick=${() => { t.action.run(); t.close(); }}>${t.action.label}</button>`}
    </div>`)}
  </div>`;
}

export function EmptyState({ icon = 'list', title, children, action }) {
  return html`<div class="empty">
    <div class="ico"><${Icon} name=${icon} size=${26} /></div>
    <h2>${title}</h2>
    <p>${children}</p>
    ${action}
  </div>`;
}

export function ErrorState({ error, onRetry }) {
  return html`<div class="card"><${EmptyState} icon="alert" title="Couldn't load this"
    action=${html`<${Button} onClick=${onRetry}>Try again<//>`}>${error.message}<//></div>`;
}

export const Skel = ({ w = '100%', h = 16, r }) =>
  html`<div class="skel" style=${{ width: typeof w === 'number' ? `${w}px` : w, height: `${h}px`, borderRadius: r ? `${r}px` : undefined }}></div>`;

export function SkelList({ rows = 5 }) {
  return html`<div class="card flush" aria-busy="true">
    ${Array.from({ length: rows }, (_, i) => html`<div class="list-row" key=${i}>
      <${Skel} w=${44} h=${46} r=${10} />
      <div class="grow stack" style="gap:8px"><${Skel} w=${`${40 + ((i * 17) % 30)}%`} h=${14} /><${Skel} w="28%" h=${11} /></div>
    </div>`)}
  </div>`;
}

export function SkelTiles({ n = 4 }) {
  return html`<div class="grid tiles" aria-busy="true">
    ${Array.from({ length: n }, (_, i) => html`<div class="card tile" key=${i}>
      <${Skel} w="55%" h=${11} /><div style="height:12px"></div><${Skel} w="70%" h=${26} /><div style="height:10px"></div><${Skel} w="45%" h=${11} />
    </div>`)}
  </div>`;
}

export function PageHead({ title, sub, back, children }) {
  return html`<div>
    ${back && html`<a class="back" href=${back.href}><${Icon} name="left" size=${14} />${back.label}</a>`}
    <div class="page-head">
      <div class="grow"><h1>${title}</h1>${sub && html`<p class="sub">${sub}</p>`}</div>
      ${children && html`<div class="row wrap">${children}</div>`}
    </div>
  </div>`;
}

export function Tile({ label, icon, value, unit, foot }) {
  return html`<div class="card tile">
    <div class="label">${icon && html`<${Icon} name=${icon} size=${14} />`}${label}</div>
    <div class="value">${value}${unit && html`<small>${unit}</small>`}</div>
    ${foot && html`<div class="foot">${foot}</div>`}
  </div>`;
}

/** Number input that keeps its own text while typing and reports a number (or null) on change. */
export function NumInput({ value, onChange, onCommit, step = 1, min = 0, class: cls = 'input', ...rest }) {
  const [text, setText] = useState(value ?? '');
  const parse = (t) => (t === '' || isNaN(Number(t)) ? null : Math.max(min, Number(t)));
  // only resync from outside when the value really differs, so typing "62." is not clobbered
  useEffect(() => {
    if (parse(String(text)) !== (value ?? null)) setText(value ?? '');
  }, [value]);
  return html`<input class=${cls} type="number" inputmode="decimal" step=${step} min=${min} value=${text}
    onInput=${(e) => { setText(e.target.value); if (onChange) onChange(parse(e.target.value)); }}
    onBlur=${(e) => onCommit && onCommit(parse(e.target.value))}
    onFocus=${(e) => e.target.select()} ...${rest} />`;
}
