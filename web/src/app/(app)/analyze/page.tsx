import Analyzer from "./Analyzer";

export default function AnalyzePage() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Live analysis</p>
        <h1 className="display text-4xl font-bold leading-none">Analyze an image</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Everything else in this pilot is seeded. This isn&apos;t: upload a match photo, broadcast frame or social post
          and it goes to the vision model now. The result is saved to your club&apos;s posts.
        </p>
      </div>

      <Analyzer />
    </div>
  );
}
