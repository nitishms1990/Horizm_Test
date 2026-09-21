import Link from "next/link";
import { apiGet, type OrgProfile, type PostDetail } from "@/lib/api";
import { compact, shortDate } from "@/lib/format";
import PostAnalysis from "./PostAnalysis";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, profile] = await Promise.all([
    apiGet<PostDetail>(`/v1/posts/${id}`),
    apiGet<OrgProfile>("/v1/org"),
  ]);

  const cpmByPlacement = Object.fromEntries(profile.rateCard.map((card) => [card.placement, card.cpm]));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{shortDate(detail.post.postedAt)}</p>
          <h1 className="display text-3xl font-bold leading-none">{detail.post.caption}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {compact(detail.post.impressions)} impressions · {compact(detail.post.reach)} reach ·{" "}
            {detail.post.source === "upload" ? "Uploaded and analyzed live" : "Seeded matchday frame"}
          </p>
        </div>
        <Link href="/posts" className="text-sm text-[var(--muted)] hover:text-[var(--turf)]">
          Back to posts
        </Link>
      </div>

      <PostAnalysis
        imageUrl={detail.post.imageUrl}
        impressions={detail.post.impressions}
        scene={detail.post.scene}
        detections={detail.detections}
        cpmByPlacement={cpmByPlacement}
      />
    </div>
  );
}
