import Link from "next/link";
import { apiGet, type PostSummary } from "@/lib/api";
import { compact, money, shortDate } from "@/lib/format";

export default async function PostsPage() {
  const { posts } = await apiGet<{ posts: PostSummary[] }>("/v1/posts?days=120&limit=60");

  return (
    <div className="grid gap-6">
      <div>
        <p className="label">Last 120 days</p>
        <h1 className="display text-4xl font-bold leading-none">Posts</h1>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <li key={post.id} className="overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--surface)]">
            <Link href={`/posts/${post.id}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt="" className="aspect-video w-full object-cover" />
              <div className="p-4">
                <p className="label">{shortDate(post.postedAt)}</p>
                <p className="mt-1 truncate font-semibold">{post.caption}</p>
                <div className="mt-3 flex items-center justify-between text-sm tabular">
                  <span className="text-[var(--muted)]">
                    {compact(post.impressions)} impressions · {post.detectionCount} logos
                  </span>
                  <span className="font-semibold">{money(post.value)}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
