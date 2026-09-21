export default function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)] p-4">
      <p className="label">{label}</p>
      <p className="display tabular mt-1 text-4xl font-bold leading-none">{value}</p>
      {note ? <p className="mt-1 text-sm text-[var(--muted)]">{note}</p> : null}
    </div>
  );
}
