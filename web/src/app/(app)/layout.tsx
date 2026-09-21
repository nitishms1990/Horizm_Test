import Link from "next/link";
import { redirect } from "next/navigation";
import { apiGet, Unauthorized, type Me } from "@/lib/api";
import SignOutButton from "@/components/SignOutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/analyze", label: "Analyze" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me: Me;
  try {
    me = await apiGet<Me>("/v1/auth/me");
  } catch (error) {
    if (error instanceof Unauthorized) redirect("/login");
    throw error;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--rule)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <Link href="/dashboard" className="display text-2xl font-bold leading-none">
            Horizm
          </Link>
          <span className="rounded border border-[var(--accent-ink)] px-1.5 py-0.5 label !text-[var(--accent-ink)]">
            Sample data
          </span>

          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-[var(--turf)]">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-[var(--muted)]">{me.user.orgName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-sm text-[var(--muted)]">
        Pilot build. Clubs are real; sponsors, posts, engagement figures and images are invented for this
        demonstration and describe no real sponsorship.
      </footer>
    </div>
  );
}
