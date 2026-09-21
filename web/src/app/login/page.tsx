import LoginForm from "./LoginForm";

const DEMO_CLUBS = [
  "bristol-city",
  "birmingham-city",
  "coventry-city",
  "derby-county",
  "hull-city",
];

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <p className="label mb-2">Horizm pilot · sample data</p>
        <h1 className="display text-5xl font-bold leading-none mb-2">Sponsor exposure</h1>
        <p className="text-[var(--muted)] mb-8">
          Sign in to your club to see what your sponsors got from your social posts.
        </p>

        <LoginForm />

        <div className="mt-8 rounded-md border border-[var(--rule)] bg-[var(--surface)] p-4">
          <p className="label mb-2">Pilot accounts</p>
          <ul className="font-mono text-[13px] text-[var(--muted)] space-y-1">
            {DEMO_CLUBS.map((slug) => (
              <li key={slug}>{slug}@horizm.test</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Password for all pilot accounts: <span className="font-mono">pilot1234</span>
          </p>
        </div>
      </div>
    </main>
  );
}
