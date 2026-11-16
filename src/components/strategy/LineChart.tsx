"use client";

import { useEffect, useId, useRef, useState } from "react";

export type LineChartSeries = {
  label: string;
  color: string;
  data: (number | null)[];
  dashed?: boolean;
  fill?: boolean;
};

export type LineChartProps = {
  labels: string[];
  series: LineChartSeries[];
  yMin?: number;
  yMax?: number;
  yFormat?: (v: number) => string;
  height?: number;
};

/** Width used before the container has been measured (SSR / first paint). */
const DEFAULT_WIDTH = 640;
const PAD = { top: 16, right: 20, bottom: 28, left: 52 };
const TICKS = 5;

const defaultFormat = (v: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(v);

/** Pick a "nice" rounded step so axis ticks land on friendly numbers. */
function niceBounds(lo: number, hi: number): [number, number] {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const rawStep = (hi - lo) / (TICKS - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export function LineChart({
  labels,
  series,
  yMin,
  yMax,
  yFormat = defaultFormat,
  height = 280,
}: LineChartProps) {
  const uid = useId();
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 1 SVG unit = 1 CSS px, so text keeps its real 12px size at any width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const values = series.flatMap((s) =>
    s.data.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  if (values.length === 0) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="py-8 text-center text-xs text-zinc-600 dark:text-zinc-400">
          ไม่มีข้อมูลเชิงตัวเลขสำหรับแสดงกราฟ
        </p>
      </div>
    );
  }

  const [autoLo, autoHi] = niceBounds(Math.min(...values), Math.max(...values));
  const lo = yMin ?? autoLo;
  const hi = yMax ?? autoHi;
  const span = hi - lo || 1;

  const H = height;
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = H - PAD.top - PAD.bottom;
  const n = labels.length;
  const xAt = (i: number) =>
    PAD.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH;

  const ticks = Array.from(
    { length: TICKS },
    (_, k) => lo + (span * k) / (TICKS - 1),
  );

  const hoverVal =
    hover !== null ? series[hover.s]?.data[hover.i] ?? null : null;

  return (
    <div ref={wrapRef} className="w-full">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="22"
                y2="4"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray={s.dashed ? "5 3" : undefined}
              />
            </svg>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${H}`}
          width={width}
          height={H}
          role="img"
          aria-label="กราฟเส้นแนวโน้ม"
          className="block max-w-full"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(t)}
                y2={yAt(t)}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={yAt(t) + 4}
                textAnchor="end"
                fontSize="12"
                className="fill-zinc-600 dark:fill-zinc-400"
              >
                {yFormat(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text
              key={`${l}-${i}`}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="12"
              className="fill-zinc-600 dark:fill-zinc-400"
            >
              {l}
            </text>
          ))}
          {series.map((s, si) => {
            // null gaps are spanned: only non-null points are connected
            const pts = s.data
              .map((v, i) => (v === null ? null : { x: xAt(i), y: yAt(v), i }))
              .filter((p): p is { x: number; y: number; i: number } => !!p);
            if (pts.length === 0) return null;
            const path = pts
              .map((p, k) => `${k === 0 ? "M" : "L"}${p.x},${p.y}`)
              .join(" ");
            const area = `${path} L${pts[pts.length - 1].x},${yAt(lo)} L${pts[0].x},${yAt(lo)} Z`;
            const gid = `${uid}-g${si}`;
            return (
              <g key={s.label}>
                {s.fill && (
                  <>
                    <defs>
                      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={area} fill={`url(#${gid})`} />
                  </>
                )}
                <path
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeDasharray={s.dashed ? "6 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {!s.dashed &&
                  pts.map((p) => (
                    <g key={p.i}>
                      <circle cx={p.x} cy={p.y} r="4.5" fill={s.color}>
                        <title>
                          {`${s.label} • ${labels[p.i]}: ${yFormat(s.data[p.i] as number)}`}
                        </title>
                      </circle>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="14"
                        fill="transparent"
                        onMouseEnter={() => setHover({ s: si, i: p.i })}
                        onClick={() => setHover({ s: si, i: p.i })}
                      />
                    </g>
                  ))}
              </g>
            );
          })}
        </svg>
        {hover !== null && hoverVal !== null && (
          <div
            className="pointer-events-none absolute -mt-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-zinc-200 bg-surface px-2 py-1 text-xs shadow-md dark:border-zinc-700"
            style={{
              left: xAt(hover.i),
              top: yAt(hoverVal),
            }}
          >
            <span className="font-medium">{labels[hover.i]}</span>
            {": "}
            <span className="tabular-nums">{yFormat(hoverVal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
