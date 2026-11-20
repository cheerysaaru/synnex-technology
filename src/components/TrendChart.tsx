/* Two-series line chart: quoted vs invoiced per month.
   One y-axis, legend + direct end labels, hover crosshair, table view. */
import { useState } from "react";
import { money } from "../lib/calc";

const SERIES = [
  { key: "quoted", label: "Quoted", color: "#2F6BFF" },
  { key: "invoiced", label: "Invoiced", color: "#16A3B8" },
] as const;

type Row = { month: string; quoted: number; invoiced: number };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (m: string) => MON[Number(m.slice(5, 7)) - 1];

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(0)}K` : String(n));

export function TrendChart({ data, currency }: { data: Row[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640;
  const H = 300;
  const pad = { l: 44, r: 70, t: 14, b: 28 };
  const max = niceMax(Math.max(...data.flatMap((d) => [d.quoted, d.invoiced])));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const path = (k: "quoted" | "invoiced") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const area = `${path("quoted")} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = data.length - 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-mute">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <button type="button" onClick={() => setTable((v) => !v)} className="ml-auto rounded-full border border-line px-3 py-1 font-medium text-ink hover:border-ink/30">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-mute">
            <tr><th className="py-2 font-medium">Month</th><th className="py-2 text-right font-medium">Quoted</th><th className="py-2 text-right font-medium">Invoiced</th></tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {data.map((d) => (
              <tr key={d.month}><td className="py-2">{label(d.month)} {d.month.slice(0, 4)}</td><td className="py-2 text-right tabular-nums">{money(d.quoted)}</td><td className="py-2 text-right tabular-nums">{money(d.invoiced)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Quoted and invoiced amounts for the last six months" onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="qfill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2F6BFF" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#2F6BFF" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f3" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#7c8089">{short(t)}</text>
              </g>
            ))}
            {data.map((d, i) => (
              <text key={d.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#7c8089">{label(d.month)}</text>
            ))}
            <path d={area} fill="url(#qfill)" />
            {SERIES.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* direct end labels */}
            {SERIES.map((s, k) => (
              <text key={s.key} x={x(last) + 8} y={y(data[last][s.key]) + 4 + (k === 1 && Math.abs(y(data[last].quoted) - y(data[last].invoiced)) < 12 ? 12 : 0)} fontSize="11" fontWeight="600" fill="#121212">{s.label}</text>
            ))}
            {hover !== null ? (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#121212" strokeDasharray="3 3" strokeWidth="1" />
                {SERIES.map((s) => <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />)}
              </g>
            ) : null}
            {data.map((d, i) => (
              <rect key={d.month} x={x(i) - (W - pad.l - pad.r) / (2 * Math.max(1, last))} y={pad.t} width={(W - pad.l - pad.r) / Math.max(1, last)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          {hover !== null ? (
            <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <p className="font-semibold">{label(data[hover].month)} {data[hover].month.slice(0, 4)}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="mt-0.5 flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}: {currency} {money(data[hover][s.key])}</p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
