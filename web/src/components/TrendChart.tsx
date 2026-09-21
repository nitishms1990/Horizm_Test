import { compactMoney } from "@/lib/format";

type Point = { label: string; value: number };

/**
 * Small area chart drawn as SVG: no chart library, no client JavaScript, and the axis
 * labels name values the line actually reaches.
 */
export default function TrendChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  if (points.length < 2) {
    return <p className="p-4 text-sm text-[var(--muted)]">Not enough weeks of data to draw a trend yet.</p>;
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 26, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...points.map((point) => point.value)) || 1;
  const x = (i: number) => padding.left + (i / (points.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;

  const line = points.map((point, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padding.top + plotHeight} L ${padding.left} ${
    padding.top + plotHeight
  } Z`;

  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Weekly media value">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="var(--rule)" strokeWidth="1" />
          <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
            {compactMoney(tick)}
          </text>
        </g>
      ))}

      <path d={area} fill="var(--turf-soft)" />
      <path d={line} fill="none" stroke="var(--turf)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />

      {points.map((point, i) =>
        i % labelEvery === 0 || i === points.length - 1 ? (
          <text key={point.label + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
