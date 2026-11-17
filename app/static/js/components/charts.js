// Small single-series SVG charts. Marks use the accent; all text uses text tokens.
import { html, useEffect, useRef, useState } from '../lib.js';
import { fmtCompact, fmtNum } from '../format.js';

function useWidth() {
  const ref = useRef();
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = lo; v < max + step * 0.999; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function pointerIndex(e, el, count, left, plotW) {
  const x = e.clientX - el.getBoundingClientRect().left - left;
  return Math.max(0, Math.min(count - 1, Math.round((x / plotW) * (count - 1))));
}

/** points: [{ label, value, detail? }] */
export function LineChart({ points, height = 200, unit = '', zero = false }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  let body = null;
  if (width && points.length) {
    const values = points.map((p) => p.value);
    const ticks = niceTicks(zero ? 0 : Math.min(...values), Math.max(...values));
    const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const x = (i) => pad.l + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v) => pad.t + plotH - ((v - lo) / (hi - lo)) * plotH;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 70)));
    const h = hover !== null && points[hover] ? hover : null;
    const move = (e) => setHover(pointerIndex(e, e.currentTarget, points.length, pad.l, plotW));
    body = html`
      <svg width=${width} height=${height} role="img" aria-label="Line chart"
        onPointerMove=${move} onPointerDown=${move} onPointerLeave=${() => setHover(null)} style="touch-action: pan-y">
        ${ticks.map((t) => html`<g key=${t}>
          <line class="gridline" x1=${pad.l} x2=${width - pad.r} y1=${y(t)} y2=${y(t)} />
          <text x=${pad.l - 8} y=${y(t) + 4} text-anchor="end">${fmtCompact(t)}</text>
        </g>`)}
        ${points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= labelEvery * 0.6) && html`
          <text key=${i} x=${x(i)} y=${height - 6} text-anchor=${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>${p.label}</text>`)}
        ${points.length > 1 && html`<path class="area" d=${`${path}L${x(points.length - 1)},${pad.t + plotH}L${x(0)},${pad.t + plotH}Z`} />`}
        <path class="line" d=${path} />
        ${h !== null && html`<line class="cross" x1=${x(h)} x2=${x(h)} y1=${pad.t} y2=${pad.t + plotH} />`}
        ${(points.length <= 24 || h !== null) && points.map((p, i) => (points.length <= 24 || i === h) && html`
          <circle key=${i} class="dot" cx=${x(i)} cy=${y(p.value)} r=${i === h ? 5 : points.length === 1 ? 4 : 3} />`)}
      </svg>
      ${h !== null && html`<div class="tip" style=${{ left: `${Math.max(60, Math.min(width - 60, x(h)))}px`, top: `${y(points[h].value) - 10}px` }}>
        <b>${fmtNum(points[h].value)}${unit && ` ${unit}`}</b>${points[h].detail || points[h].label}
      </div>`}`;
  }
  return html`<div class="chart" ref=${ref} style=${{ height: `${height}px` }}>${body}</div>`;
}

/** bars: [{ label, value, ghost?, detail?, dim? }] — `ghost` draws a quiet target bar behind the value. */
export function BarChart({ bars, height = 190, unit = '' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 40, r: 6, t: 12, b: 24 };
  let body = null;
  if (width && bars.length) {
    const top = Math.max(1, ...bars.map((b) => Math.max(b.value, b.ghost || 0)));
    const ticks = niceTicks(0, top, 3);
    const hi = ticks[ticks.length - 1];
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const slot = plotW / bars.length;
    const bw = Math.min(34, slot - 6);
    const y = (v) => pad.t + plotH - (v / hi) * plotH;
    const rect = (v, i, cls) => {
      const hgt = Math.max(v > 0 ? 2 : 0, pad.t + plotH - y(v));
      const r = Math.min(4, hgt, bw / 2);
      const x0 = pad.l + slot * i + (slot - bw) / 2;
      const y0 = pad.t + plotH - hgt;
      // rounded top, square at the baseline
      return html`<path class=${cls} d=${`M${x0},${y0 + hgt}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y0 + hgt}Z`} />`;
    };
    body = html`
      <svg width=${width} height=${height} role="img" aria-label="Bar chart" onPointerLeave=${() => setHover(null)}>
        ${ticks.map((t) => html`<g key=${t}>
          <line class="gridline" x1=${pad.l} x2=${width - pad.r} y1=${y(t)} y2=${y(t)} />
          <text x=${pad.l - 8} y=${y(t) + 4} text-anchor="end">${fmtCompact(t)}</text>
        </g>`)}
        ${bars.map((b, i) => html`<g key=${i}>
          ${b.ghost ? rect(b.ghost, i, 'bar-ghost') : null}
          ${rect(b.value, i, `bar ${b.dim || (hover !== null && hover !== i) ? 'dim' : ''}`)}
          <text x=${pad.l + slot * i + slot / 2} y=${height - 6} text-anchor="middle">${b.label}</text>
          <rect x=${pad.l + slot * i} y=${pad.t} width=${slot} height=${plotH + pad.b} fill="transparent"
            onPointerEnter=${() => setHover(i)} onPointerDown=${() => setHover(i)} />
        </g>`)}
      </svg>
      ${hover !== null && bars[hover] && html`<div class="tip" style=${{
        left: `${Math.max(60, Math.min(width - 60, pad.l + slot * hover + slot / 2))}px`,
        top: `${y(Math.max(bars[hover].value, bars[hover].ghost || 0)) - 8}px`,
      }}><b>${fmtNum(bars[hover].value)}${unit && ` ${unit}`}</b>${bars[hover].detail || bars[hover].label}</div>`}`;
  }
  return html`<div class="chart" ref=${ref} style=${{ height: `${height}px` }}>${body}</div>`;
}

export function Sparkline({ values, width = 96, height = 30 }) {
  if (!values || values.length < 2) return html`<span class="muted tiny">–</span>`;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v) => (hi === lo ? height / 2 : 4 + (1 - (v - lo) / (hi - lo)) * (height - 8));
  return html`<svg class="chart spark" width=${width} height=${height} aria-hidden="true">
    <path class="line" d=${values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} />
    <circle class="dot" cx=${x(values.length - 1)} cy=${y(values[values.length - 1])} r="3" />
  </svg>`;
}
