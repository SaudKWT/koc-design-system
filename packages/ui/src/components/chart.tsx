"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Charts — plain SVG on the chart tokens, in the rig3 style. No chart library.
 *
 * ── WHY THERE IS NO LIBRARY ANY MORE (2026-10-25) ─────────────────────────────
 *
 * These wrapped Recharts 3.8 until the rig3 rework. Saud chose to replace it
 * with charts of our own, on two pieces of new information:
 *
 *   1. KOC approves the component library through cybersecurity ONCE, and it
 *      freezes at approval. Recharts 3 brings Redux Toolkit, immer, reselect,
 *      d3 modules and more into the approval pack — the largest dependency tree
 *      in @koc/ui, for five chart forms.
 *   2. The DWEG landing's rig3 page drew every chart it needed — stacked
 *      columns, ranked bars, lines with projections, grouped columns — in a few
 *      hundred lines of SVG, with a table view and hover values, and it is the
 *      look Saud picked for the whole system.
 *
 * It also retires the React 19 StrictMode bug that made every Recharts line
 * render with zero pixels drawn (CLAUDE.md, "Traps"): nothing here animates, so
 * there is no mount tween to stall.
 *
 * ── RULES THESE FOLLOW (the dataviz method, as rig3 applied it) ───────────────
 *
 *   - Colour from tokens only: --chart-1..5 by series position. Prefer three
 *     series or fewer — chart-4 and chart-5 fail colour-blind separation against
 *     their neighbours under the dataviz validator (a token change is open).
 *   - Thin marks, a 2px surface gap between fills, hairline grid, one y-axis,
 *     the zero line a step darker than the rest.
 *   - A legend for two or more series; the values themselves only where they
 *     help (a single series' columns, a line's last point) — never on every mark.
 *   - Every chart has hover values AND a table. With a `title`, the chart draws
 *     its own frame with a "Table" toggle; without one, the table is
 *     visually hidden and read by screen readers, or shown with `showTable`.
 *   - Static. Nothing moves, so nothing needs a reduced-motion path.
 */

export interface ChartSeries {
  /** Key into each data row. */
  key: string;
  /** Human label, used in the legend, tooltip and table. */
  label: string;
  /** Override the token colour. Use sparingly — see the colour rule above. */
  color?: string;
  /** TrendChart only: from this row index on the line is a projection, dashed. */
  dashedFrom?: number;
}

export interface ChartProps<T extends Record<string, unknown>> {
  data: T[];
  /** Key for the category axis — usually a date or an asset name. */
  xKey: string;
  series: ChartSeries[];
  /** Plot height in px. */
  height?: number;
  /**
   * What the chart shows, in a sentence. Required: it becomes the accessible
   * name, and "chart" is not a description.
   */
  caption: string;
  /** Format axis, tooltip and table values, e.g. thousands separators or units. */
  valueFormat?: (value: number) => string;
  /**
   * Framed: start on the table view. Unframed: show the table under the plot
   * rather than keeping it for screen readers only.
   */
  showTable?: boolean;
  /**
   * A visible title. With one, the chart draws its own rig3 frame — title,
   * subtitle, legend and a Table toggle. Without one it is bare, for a card
   * that already carries the title.
   */
  title?: string;
  subtitle?: string;
  /** A footnote under the plot — a source, a caveat. */
  note?: React.ReactNode;
  className?: string;
}

/** Series colour by position, from the tested token ramp. */
function seriesColor(s: ChartSeries, i: number): string {
  return s.color ?? `var(--chart-${(i % 5) + 1})`;
}

const AXIS = "fill-muted-foreground text-[10px]";
const VALUE = "fill-foreground text-[10px] font-medium tabular-nums";
const defaultFormat = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 2 });

// ── Scales ─────────────────────────────────────────────────────────────────

const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/**
 * Round axis ticks — 1, 2, 2.5 or 5 times a power of ten — covering the data,
 * about `count` of them. `zero` pins 0 into the domain, which bars and areas
 * need (a column's length IS its value) and lines do not.
 */
export function niceTicks(min: number, max: number, count = 4, zero = true): { ticks: number[]; domain: [number, number] } {
  let lo = zero ? Math.min(0, min) : min;
  let hi = zero ? Math.max(0, max) : max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0, 1], domain: [0, 1] };
  if (lo === hi) {
    hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.1);
    if (!zero) lo -= hi - lo;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const d0 = Math.floor(lo / step) * step;
  const d1 = Math.ceil(hi / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let v = d0; v <= d1 + step / 2; v += step) ticks.push(Number(v.toFixed(decimals)));
  return { ticks, domain: [d0, d1] };
}

function useWidth<E extends HTMLElement>() {
  const ref = React.useRef<E>(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

// ── The frame ──────────────────────────────────────────────────────────────

interface LegendEntry {
  label: string;
  color: string;
  dashed?: boolean;
}

interface FrameProps {
  title?: string;
  subtitle?: string;
  caption: string;
  legend: LegendEntry[];
  columns: string[];
  rows: (string | number)[][];
  height: number;
  showTable: boolean;
  note?: React.ReactNode;
  className?: string;
  children: (width: number) => React.ReactNode;
}

/**
 * The figure every chart draws in: optional title and Table toggle, legend,
 * the plot with its hover tooltip, and the same numbers as a table. Hover
 * values come from `data-tip` on the marks, so a chart form only has to say
 * what each mark means.
 */
function ChartFrame({ title, subtitle, caption, legend, columns, rows, height, showTable, note, className, children }: FrameProps) {
  const framed = Boolean(title);
  const [ref, w] = useWidth<HTMLDivElement>();
  const [asTable, setAsTable] = React.useState(framed && showTable);
  const [tip, setTip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = (e.target as Element).closest("[data-tip]");
    const box = ref.current?.getBoundingClientRect();
    if (!t || !box) return setTip(null);
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text: t.getAttribute("data-tip") ?? "" });
  };

  const table = (visible: boolean) => (
    <div className={cn(visible ? "overflow-x-auto" : "sr-only")}>
      <table className="w-full text-xs tabular-nums">
        <caption className={visible && framed ? "sr-only" : visible ? "pb-2 text-left text-xs text-muted-foreground" : undefined}>
          {caption}
        </caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {columns.map((c, i) => (
              <th key={c} scope="col" className={cn("px-2 py-1.5 font-medium first:pl-0", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((v, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-2 py-1 pl-0 text-left font-medium">
                    {v}
                  </th>
                ) : (
                  <td key={j} className="px-2 py-1 text-right">
                    {v}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <figure
      data-slot="chart"
      className={cn("flex min-w-0 flex-col", framed ? "gap-3 rounded-xl border bg-card/70 p-4 backdrop-blur" : "gap-2", className)}
    >
      {framed && (
        <figcaption className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            className="shrink-0 rounded-full border border-input px-2.5 py-0.5 text-2xs text-muted-foreground transition-colors duration-fast ease-out hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Table<span className="sr-only"> view of {title}</span>
          </button>
        </figcaption>
      )}

      {legend.length > 1 && !asTable && (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="16" height="8" className="shrink-0">
                {l.dashed ? (
                  <line x1="0" y1="4" x2="16" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray="3 2" />
                ) : (
                  <rect x="0" y="0" width="16" height="8" rx="2" fill={l.color} />
                )}
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}

      {asTable ? (
        table(true)
      ) : (
        <div
          ref={ref}
          className="relative"
          style={{ height }}
          onPointerMove={onMove}
          onPointerLeave={() => setTip(null)}
        >
          {w > 0 && (
            <svg
              role="img"
              aria-label={`${caption}${framed ? " Use the Table button for the figures." : ""}`}
              width={w}
              height={height}
              className="block overflow-visible"
            >
              {children(w)}
            </svg>
          )}
          {tip && (
            <div
              role="presentation"
              className="pointer-events-none absolute z-10 whitespace-pre rounded-md border bg-popover px-2 py-1 text-2xs text-popover-foreground shadow-md"
              style={{ left: Math.max(0, Math.min(tip.x + 12, w - 168)), top: Math.max(0, tip.y - 40) }}
            >
              {tip.text}
            </div>
          )}
        </div>
      )}

      {/* Unframed, the numbers are still here: read by screen readers, or shown
          on request. Framed, the toggle above is the way to them. */}
      {!framed && table(showTable)}
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </figure>
  );
}

// ── Shared plot parts ──────────────────────────────────────────────────────

function Grid({ ticks, y, x0, x1, fmt }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number; fmt: (v: number) => string }) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-muted-foreground/60" : "stroke-border"} strokeWidth={1} />
          <text x={x0 - 6} y={y(t)} dy="0.32em" textAnchor="end" className={AXIS}>
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Category labels along the bottom, thinned so they never collide. `edges`
 * anchors the first and last label inward — for lines and areas, whose end
 * points sit on the plot's edges, where a centred label would be clipped.
 */
function XLabels({ cats, x, y, room, edges }: { cats: string[]; x: (i: number) => number; y: number; room: number; edges?: boolean }) {
  const every = Math.max(1, Math.ceil(cats.length / Math.max(2, Math.floor(room / 52))));
  const anchor = (i: number) => (!edges || cats.length < 2 ? "middle" : i === 0 ? "start" : i === cats.length - 1 ? "end" : "middle");
  return (
    <g aria-hidden="true">
      {cats.map((c, i) =>
        i % every === 0 || i === cats.length - 1 ? (
          <text key={`${c}-${i}`} x={x(i)} y={y} textAnchor={anchor(i)} className={AXIS}>
            {c}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** One transparent band per category carrying every series' value for the tooltip. */
function HoverBands({ n, x0, step, top, bottom, tip }: { n: number; x0: number; step: number; top: number; bottom: number; tip: (i: number) => string }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x0 + step * i} y={top} width={step} height={Math.max(0, bottom - top)} fill="transparent" data-tip={tip(i)} />
      ))}
    </g>
  );
}

function tableOf<T extends Record<string, unknown>>(data: T[], xKey: string, series: ChartSeries[], fmt: (v: number) => string) {
  return {
    columns: [xKey, ...series.map((s) => s.label)],
    rows: data.map((d) => [String(d[xKey]), ...series.map((s) => (num(d[s.key]) === null ? "—" : fmt(num(d[s.key])!)))]),
  };
}

function tipOf<T extends Record<string, unknown>>(d: T, xKey: string, series: ChartSeries[], fmt: (v: number) => string) {
  return [String(d[xKey]), ...series.map((s) => `${s.label}: ${num(d[s.key]) === null ? "—" : fmt(num(d[s.key])!)}`)].join("\n");
}

function extent<T extends Record<string, unknown>>(data: T[], series: ChartSeries[], stacked = false): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of data) {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = num(d[s.key]) ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      lo = Math.min(lo, neg);
      hi = Math.max(hi, pos);
    } else {
      for (const s of series) {
        const v = num(d[s.key]);
        if (v === null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  return [lo, hi];
}

const pathOf = (ps: [number, number][]) => ps.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

// ── Trend: lines ───────────────────────────────────────────────────────────

/**
 * Trend over time. The default for anything with a date on the x axis.
 * Each line's last value is labelled at its end; `dashedFrom` on a series
 * draws the rest of it as a projection.
 */
export function TrendChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 280,
  caption,
  valueFormat = defaultFormat,
  showTable = false,
  title,
  subtitle,
  note,
  className,
}: ChartProps<T>) {
  const [lo, hi] = extent(data, series);
  const { ticks, domain } = niceTicks(lo, hi, 4, false);
  const cats = data.map((d) => String(d[xKey]));
  const { columns, rows } = tableOf(data, xKey, series, valueFormat);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      caption={caption}
      legend={series.map((s, i) => ({ label: s.label, color: seriesColor(s, i) }))}
      columns={columns}
      rows={rows}
      height={height}
      showTable={showTable}
      note={note}
      className={className}
    >
      {(w) => {
        const left = 44, right = 44, top = 14, bottom = 20;
        const y = linear(domain[0], domain[1], height - bottom, top);
        const step = (w - left - right) / Math.max(1, cats.length - 1);
        const x = (i: number) => left + step * i;
        return (
          <>
            <Grid ticks={ticks} y={y} x0={left} x1={w - right} fmt={valueFormat} />
            <XLabels cats={cats} x={x} y={height - 5} room={w - left - right} edges />
            {series.map((s, si) => {
              const color = seriesColor(s, si);
              const pts = data
                .map((d, i) => (num(d[s.key]) === null ? null : ([x(i), y(num(d[s.key])!)] as [number, number])))
                .filter((p): p is [number, number] => p !== null);
              const cut = s.dashedFrom ?? pts.length;
              let lastI = data.length - 1;
              while (lastI >= 0 && num(data[lastI][s.key]) === null) lastI--;
              const last = lastI >= 0 ? num(data[lastI][s.key]) : null;
              return (
                <g key={s.key} aria-hidden="true">
                  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                    {pts.slice(0, cut).length > 1 && <path d={pathOf(pts.slice(0, cut))} stroke={color} strokeWidth={2} />}
                    {cut < pts.length && (
                      <path d={pathOf(pts.slice(Math.max(0, cut - 1)))} stroke={color} strokeWidth={2} strokeDasharray="5 4" />
                    )}
                  </g>
                  {last !== null && (
                    <>
                      <circle cx={x(lastI)} cy={y(last)} r={3.5} fill={color} stroke="var(--card)" strokeWidth={2} />
                      <text x={x(lastI) + 7} y={y(last)} dy="0.32em" className={VALUE}>
                        {valueFormat(last)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            <HoverBands
              n={cats.length}
              x0={left - step / 2}
              step={step}
              top={top}
              bottom={height - bottom}
              tip={(i) => tipOf(data[i], xKey, series, valueFormat)}
            />
          </>
        );
      }}
    </ChartFrame>
  );
}

// ── Comparison: grouped columns ────────────────────────────────────────────

/**
 * Comparison across categories — wells, rigs, units, weeks. One column per
 * series in each category; negative values hang below the zero line. A single
 * series carries its values on the columns.
 */
export function ComparisonChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 280,
  caption,
  valueFormat = defaultFormat,
  showTable = false,
  title,
  subtitle,
  note,
  className,
}: ChartProps<T>) {
  const [lo, hi] = extent(data, series);
  const { ticks, domain } = niceTicks(lo, hi);
  const cats = data.map((d) => String(d[xKey]));
  const { columns, rows } = tableOf(data, xKey, series, valueFormat);
  const single = series.length === 1;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      caption={caption}
      legend={series.map((s, i) => ({ label: s.label, color: seriesColor(s, i) }))}
      columns={columns}
      rows={rows}
      height={height}
      showTable={showTable}
      note={note}
      className={className}
    >
      {(w) => {
        const left = 44, right = 4, top = single ? 16 : 8, bottom = 20;
        const y = linear(domain[0], domain[1], height - bottom, top);
        const step = (w - left - right) / Math.max(1, cats.length);
        const gap = 2;
        const bw = Math.max(3, Math.min(single ? 56 : 18, (step * 0.72) / series.length - gap));
        const cx = (i: number) => left + step * (i + 0.5);
        const labelValues = single && bw >= 18;
        return (
          <>
            <Grid ticks={ticks} y={y} x0={left} x1={w - right} fmt={valueFormat} />
            <XLabels cats={cats} x={cx} y={height - 5} room={w - left - right} />
            {data.map((d, i) => {
              const start = cx(i) - (series.length * (bw + gap) - gap) / 2;
              return (
                <g key={i} aria-hidden="true">
                  {series.map((s, si) => {
                    const v = num(d[s.key]);
                    if (v === null) return null;
                    const y0 = y(0), y1 = y(v);
                    return (
                      <g key={s.key}>
                        <rect
                          x={start + si * (bw + gap)}
                          y={Math.min(y0, y1)}
                          width={bw}
                          height={Math.max(1, Math.abs(y1 - y0))}
                          rx={2}
                          fill={seriesColor(s, si)}
                        />
                        {labelValues && (
                          <text x={start + bw / 2} y={v < 0 ? y1 + 12 : y1 - 5} textAnchor="middle" className={VALUE}>
                            {valueFormat(v)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <HoverBands
              n={cats.length}
              x0={left}
              step={step}
              top={top}
              bottom={height - bottom}
              tip={(i) => tipOf(data[i], xKey, series, valueFormat)}
            />
          </>
        );
      }}
    </ChartFrame>
  );
}

// ── Volume: areas ──────────────────────────────────────────────────────────

/** Cumulative or volume-over-time: a filled area under each line, from zero. */
export function VolumeChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 280,
  caption,
  valueFormat = defaultFormat,
  showTable = false,
  title,
  subtitle,
  note,
  className,
}: ChartProps<T>) {
  const [lo, hi] = extent(data, series);
  const { ticks, domain } = niceTicks(lo, hi);
  const cats = data.map((d) => String(d[xKey]));
  const { columns, rows } = tableOf(data, xKey, series, valueFormat);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      caption={caption}
      legend={series.map((s, i) => ({ label: s.label, color: seriesColor(s, i) }))}
      columns={columns}
      rows={rows}
      height={height}
      showTable={showTable}
      note={note}
      className={className}
    >
      {(w) => {
        const left = 44, right = 8, top = 10, bottom = 20;
        const y = linear(domain[0], domain[1], height - bottom, top);
        const step = (w - left - right) / Math.max(1, cats.length - 1);
        const x = (i: number) => left + step * i;
        return (
          <>
            <Grid ticks={ticks} y={y} x0={left} x1={w - right} fmt={valueFormat} />
            <XLabels cats={cats} x={x} y={height - 5} room={w - left - right} edges />
            {series.map((s, si) => {
              const color = seriesColor(s, si);
              const pts = data.map((d, i) => [x(i), y(num(d[s.key]) ?? 0)] as [number, number]);
              if (pts.length < 2) return null;
              const area = `${pathOf(pts)}L${pts[pts.length - 1][0].toFixed(1)},${y(0).toFixed(1)}L${pts[0][0].toFixed(1)},${y(0).toFixed(1)}Z`;
              return (
                <g key={s.key} aria-hidden="true">
                  <path d={area} fill={`color-mix(in oklab, ${color} 16%, transparent)`} />
                  <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                </g>
              );
            })}
            <HoverBands
              n={cats.length}
              x0={left - step / 2}
              step={step}
              top={top}
              bottom={height - bottom}
              tip={(i) => tipOf(data[i], xKey, series, valueFormat)}
            />
          </>
        );
      }}
    </ChartFrame>
  );
}

// ── Composition: stacked columns ───────────────────────────────────────────

export interface StackedChartProps<T extends Record<string, unknown>> extends ChartProps<T> {
  /** Draw each column as shares of its total (0–100%). */
  percent?: boolean;
  /** Print each column's total above it. */
  totals?: boolean;
}

/**
 * Parts of a whole per category, first series at the bottom. `percent` scales
 * every column to 100%; `totals` prints the absolute total above each column
 * (useful exactly when `percent` hides it).
 */
export function StackedChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 280,
  caption,
  valueFormat = defaultFormat,
  showTable = false,
  title,
  subtitle,
  note,
  className,
  percent = false,
  totals = false,
}: StackedChartProps<T>) {
  const sums = data.map((d) => series.reduce((a, s) => a + Math.max(0, num(d[s.key]) ?? 0), 0));
  const [lo, hi] = percent ? [0, 100] : extent(data, series, true);
  const { ticks, domain } = percent ? { ticks: [0, 50, 100], domain: [0, 100] as [number, number] } : niceTicks(lo, hi);
  const cats = data.map((d) => String(d[xKey]));
  const fmtShare = (v: number) => `${Math.round(v)}%`;
  const { columns, rows } = tableOf(data, xKey, series, valueFormat);
  if (totals) {
    columns.push("Total");
    rows.forEach((r, i) => r.push(valueFormat(sums[i])));
  }

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      caption={caption}
      legend={series.map((s, i) => ({ label: s.label, color: seriesColor(s, i) }))}
      columns={columns}
      rows={rows}
      height={height}
      showTable={showTable}
      note={note}
      className={className}
    >
      {(w) => {
        const left = 44, right = 4, top = totals ? 20 : 8, bottom = 20;
        const y = linear(domain[0], domain[1], height - bottom, top);
        const step = (w - left - right) / Math.max(1, cats.length);
        const bw = Math.min(56, step * 0.62);
        const cx = (i: number) => left + step * (i + 0.5);
        return (
          <>
            <Grid ticks={ticks} y={y} x0={left} x1={w - right} fmt={percent ? fmtShare : valueFormat} />
            <XLabels cats={cats} x={cx} y={height - 5} room={w - left - right} />
            {data.map((d, i) => {
              let acc = 0;
              return (
                <g key={i} aria-hidden="true">
                  {series.map((s, si) => {
                    const raw = Math.max(0, num(d[s.key]) ?? 0);
                    const v = percent ? (sums[i] ? (raw / sums[i]) * 100 : 0) : raw;
                    if (!v) return null;
                    const y0 = y(acc), y1 = y(acc + v);
                    acc += v;
                    // The 2px surface gap between segments: each fill stops
                    // 1px short at both ends.
                    return (
                      <rect key={s.key} x={cx(i) - bw / 2} y={y1 + 1} width={bw} height={Math.max(0, y0 - y1 - 2)} rx={2} fill={seriesColor(s, si)} />
                    );
                  })}
                  {totals && (
                    <text x={cx(i)} y={y(percent ? 100 : sums[i]) - 6} textAnchor="middle" className={VALUE}>
                      {valueFormat(sums[i])}
                    </text>
                  )}
                </g>
              );
            })}
            <HoverBands
              n={cats.length}
              x0={left}
              step={step}
              top={top}
              bottom={height - bottom}
              tip={(i) =>
                [
                  cats[i],
                  ...series.map((s) => {
                    const v = num(data[i][s.key]) ?? 0;
                    return `${s.label}: ${valueFormat(v)}${percent && sums[i] ? ` (${fmtShare((v / sums[i]) * 100)})` : ""}`;
                  }),
                  ...(totals || percent ? [`Total: ${valueFormat(sums[i])}`] : []),
                ].join("\n")
              }
            />
          </>
        );
      }}
    </ChartFrame>
  );
}

// ── Ranking: horizontal bars ───────────────────────────────────────────────

/**
 * A ranked list as bars — contractors, rigs, call-offs by wait. One series
 * (the first); rows in the order given, so sort before passing. Height
 * follows the rows unless `height` is set.
 */
export function BarList<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height,
  caption,
  valueFormat = defaultFormat,
  showTable = false,
  title,
  subtitle,
  note,
  className,
}: ChartProps<T>) {
  const s = series[0];
  const row = 22;
  const h = height ?? Math.max(row, data.length * row);
  const max = Math.max(0, ...data.map((d) => num(d[s.key]) ?? 0));
  const { columns, rows } = tableOf(data, xKey, [s], valueFormat);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      caption={caption}
      legend={[]}
      columns={columns}
      rows={rows}
      height={h}
      showTable={showTable}
      note={note}
      className={className}
    >
      {(w) => {
        const left = Math.min(160, Math.max(72, w * 0.28)), right = 52;
        const x = linear(0, max || 1, left, w - right);
        const color = seriesColor(s, 0);
        return (
          <>
            {data.map((d, i) => {
              const v = num(d[s.key]) ?? 0;
              return (
                <g key={i} transform={`translate(0 ${i * row})`} data-tip={`${String(d[xKey])}\n${valueFormat(v)}`}>
                  <rect x={0} y={0} width={w} height={row} fill="transparent" />
                  <text x={left - 8} y={row / 2} dy="0.32em" textAnchor="end" className="fill-foreground text-[11px]" aria-hidden="true">
                    {String(d[xKey])}
                  </text>
                  <rect x={left} y={4} width={Math.max(2, x(v) - left)} height={row - 8} rx={2} fill={color} aria-hidden="true" />
                  <text x={x(v) + 6} y={row / 2} dy="0.32em" className={VALUE} aria-hidden="true">
                    {valueFormat(v)}
                  </text>
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
