import AnalystChat from "@/components/AnalystChat";

export default function AskPage() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Reads your data with the platform&apos;s own tools</p>
        <h1 className="display text-4xl font-bold leading-none">Ask the analyst</h1>
      </div>

      <AnalystChat />

      <p className="text-sm text-[var(--muted)]">
        The analyst can only see your club. It has no database access and no query tool — just the same read-only
        tools the pages use — and every question is recorded with the tools it called.
      </p>
    </div>
  );
}
