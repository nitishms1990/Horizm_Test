/**
 * Server-side calls to the API.
 *
 * Pages render on the server, so the visitor's session cookie is forwarded on each
 * call. The web app has no database access of its own: everything it shows came
 * through an endpoint a client could call themselves.
 */
import { cookies } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

export class Unauthorized extends Error {}

export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (response.status === 401) throw new Unauthorized();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The API returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

export type Me = {
  user: { id: string; name: string; email: string; orgName: string; orgSlug: string; role: string };
};

export type Summary = {
  window: { days: number };
  totals: { posts: number; impressions: number; detections: number; sponsors: number; value: number };
  trend: { label: string; posts: number; impressions: number; value: number }[];
  topSponsors: { sponsorId: string; name: string; appearances: number; exposure: number; value: number }[];
};

export type PostSummary = {
  id: string;
  caption: string;
  postedAt: string;
  imageUrl: string;
  impressions: number;
  likes: number;
  comments: number;
  detectionCount: number;
  value: number;
};

export type PostDetail = {
  post: PostSummary & { width: number; height: number; reach: number; scene: string; source: string };
  detections: {
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
    quality: number;
  }[];
};

export type SponsorList = {
  window: { days: number };
  sponsors: { sponsorId: string; name: string; appearances: number; exposure: number; value: number }[];
};

export type SponsorDetail = {
  sponsor: { sponsorId: string; name: string; appearances: number; exposure: number; value: number };
  placements: { placement: string; appearances: number; averageQuality: number }[];
  trend: { label: string; appearances: number; value: number }[];
  posts: (PostSummary & { appearances: number })[];
};

export type Marketplace = {
  cohort: { description: string; size: number; sufficient: boolean; window?: { days: number } };
  benchmarks: {
    metric: string;
    label: string;
    unit: string;
    yourValue: number;
    cohortMedian: number;
    cohortP25: number;
    cohortP75: number;
    percentile: number;
    cohortSize: number;
  }[];
  categoryMix?: { category: string; appearances: number }[];
  note?: string;
};

export type OrgProfile = {
  org: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    sport: string;
    division: string;
    primaryColor: string;
    accentColor: string;
  };
  rateCard: { placement: string; cpm: number }[];
  socialAccounts: { platform: string; handle: string; connectedAt: string | null; demo: boolean }[];
};
