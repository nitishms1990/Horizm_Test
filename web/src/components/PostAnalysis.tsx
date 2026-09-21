"use client";

import { useMemo, useState } from "react";
import { PLACEMENTS, exposure, mediaValue, quality, type Placement } from "@horizm/contracts";
import { index, money, percent } from "@/lib/format";

type Detection = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  placement: string;
  location: string;
  x: number;
  y: number;
  size_pct: number;
  clarity: number;
  obstruction: number;
  confidence: number;
  counted: boolean;
};

const asPlacement = (value: string): Placement =>
  (Object.prototype.hasOwnProperty.call(PLACEMENTS, value) ? value : "other") as Placement;

/**
 * The image with its pins, and the sponsor totals beside it.
 *
 * Unticking a row writes to the API and recalculates here, using the same scoring
 * functions the API uses, so the figures can't drift between the two.
 */
export default function PostAnalysis({
  imageUrl,
  impressions,
  scene,
  detections: initial,
  cpmByPlacement,
}: {
  imageUrl: string;
  impressions: number;
  scene: string;
  detections: Detection[];
  cpmByPlacement: Record<string, number>;
}) {
  const [detections, setDetections] = useState(initial);
  const [hovered, setHovered] = useState<string | null>(null);

  const sponsors = useMemo(() => {
    const bySponsor = new Map<string, { name: string; qualities: number[]; cpmWeighted: number }>();
    for (const d of detections) {
      if (!d.counted) continue;
      const placement = asPlacement(d.placement);
      const q = quality({ size_pct: d.size_pct, clarity: d.clarity, obstruction: d.obstruction, placement });
      const entry = bySponsor.get(d.sponsorId) ?? { name: d.sponsorName, qualities: [], cpmWeighted: 0 };
      entry.qualities.push(q);
      entry.cpmWeighted += q * (cpmByPlacement[placement] ?? cpmByPlacement.other ?? 8);
      bySponsor.set(d.sponsorId, entry);
    }

    return [...bySponsor.entries()]
      .map(([sponsorId, entry]) => {
        const sum = entry.qualities.reduce((total, q) => total + q, 0);
        const cpm = sum > 0 ? entry.cpmWeighted / sum : 0;
        const exposureIndex = exposure(entry.qualities);
        return {
          sponsorId,
          name: entry.name,
          appearances: entry.qualities.length,
          exposure: exposureIndex,
          value: mediaValue(exposureIndex, impressions, cpm),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [detections, cpmByPlacement, impressions]);

  const total = sponsors.reduce((sum, sponsor) => sum + sponsor.value, 0);

  async function toggle(detection: Detection, counted: boolean) {
    setDetections((current) => current.map((d) => (d.id === detection.id ? { ...d, counted } : d)));
    const response = await fetch(`/api/v1/detections/${detection.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ counted }),
    });
    if (!response.ok) {
      // Put it back if the API refused.
      setDetections((current) => current.map((d) => (d.id === detection.id ? { ...d, counted: !counted } : d)));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-3">
        <div className="relative grid place-items-center bg-[var(--monitor)] p-3">
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="block w-full rounded" />
            {detections.map((detection, i) => (
              <span
                key={detection.id}
                className={`absolute grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full font-mono text-[11px] font-semibold shadow ring-2 ring-black/60 transition ${
                  detection.counted ? "bg-[var(--accent)] text-[#15201b]" : "bg-gray-400 text-gray-900 opacity-70"
                } ${hovered === detection.id ? "scale-125" : ""}`}
                style={{
                  left: `${detection.x * 100}%`,
                  top: `${detection.y * 100}%`,
                  transform: `translate(-50%, ${detection.y < 0.12 ? "8px" : "calc(-100% - 8px)"})`,
                }}
                aria-hidden
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
        {scene ? <p className="px-1 pt-3 text-sm text-[var(--muted)]">{scene}</p> : null}
      </div>

      <div className="grid gap-4">
        <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-5">
          <p className="label">Media value from this post</p>
          <p className="display tabular mt-1 text-5xl font-bold leading-none">{money(total)}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {sponsors.length} sponsors · {detections.filter((d) => d.counted).length} logo appearances
          </p>
        </div>

        <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-4">
          <h2 className="display pt-4 text-lg font-semibold">By sponsor</h2>
          <table className="w-full border-collapse tabular text-sm">
            <tbody>
              {sponsors.map((sponsor) => (
                <tr key={sponsor.sponsorId} className="border-t border-[var(--rule)]">
                  <td className="py-2 font-semibold">{sponsor.name}</td>
                  <td className="py-2 text-right text-[var(--muted)]">{index(sponsor.exposure)}</td>
                  <td className="py-2 text-right">{money(sponsor.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] px-5 pb-4">
          <h2 className="display pt-4 text-lg font-semibold">Logo appearances</h2>
          <p className="mb-1 text-sm text-[var(--muted)]">Untick a row to drop a wrong detection from the totals.</p>
          <ul>
            {detections.map((detection, i) => (
              <li
                key={detection.id}
                className="grid grid-cols-[24px_1fr_auto] items-start gap-3 border-t border-[var(--rule)] py-3"
                onMouseEnter={() => setHovered(detection.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] font-mono text-[11px] font-semibold text-[#15201b]">
                  {i + 1}
                </span>
                <div className={detection.counted ? "" : "opacity-50"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{detection.sponsorName}</strong>
                    <span className="label rounded bg-[var(--turf-soft)] px-1.5 py-0.5 !text-[var(--ink)]">
                      {PLACEMENTS[asPlacement(detection.placement)].label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted)]">{detection.location}</p>
                  <p className="font-mono text-[11px] text-[var(--muted)]">
                    area {detection.size_pct.toFixed(1)}% · clarity {percent(detection.clarity)} · hidden{" "}
                    {percent(detection.obstruction)}
                  </p>
                </div>
                <label className="flex items-center gap-2 pt-0.5 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={detection.counted}
                    onChange={(event) => toggle(detection, event.target.checked)}
                    className="h-4 w-4 accent-[var(--turf)]"
                  />
                  Count
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
