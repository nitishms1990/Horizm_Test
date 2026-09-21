# Horizm pilot

Sponsor exposure measurement for rights holders. Each club signs in, sees what its sponsors
got from its social posts, and compares its position against an anonymised cohort.

**The data is invented.** Clubs are real; the sponsors, posts, engagement figures and images
are synthetic and describe no real sponsorship. The only thing that is not synthetic is the
live analysis on the Analyze page: upload an image and it goes to a vision model now.

## Running it

Requirements: Node 20+, and [Claude Code](https://claude.com/claude-code) signed in
(`claude auth login`) for the live analysis. Everything else runs from a local SQLite file.

```bash
npm run setup     # install, create the database, generate the demo clubs and images
npm run dev       # API on :4000, app on http://localhost:3000
```

Sign in as any club, password `pilot1234`:

```
bristol-city@horizm.test
birmingham-city@horizm.test
coventry-city@horizm.test
derby-county@horizm.test
hull-city@horizm.test
```

`npm test` runs the scoring tests.

## Shape

```
web/         Next.js 16, React 19, TypeScript, Tailwind — screens only, no database access
api/         Fastify, Prisma, SQLite — data, sessions, and the vision call
contracts/   Zod schemas, placement weights and the scoring functions, shared by both
```

The web app talks to the API over HTTP like any other client would. Next.js proxies
`/api/*` and `/media/*` to the API so the session cookie stays first-party and there is no
CORS configuration anywhere.

Both halves import the scoring functions from `contracts`, so when someone unticks a
detection in the browser and the figures recalculate instantly, they cannot drift from what
the API would have returned.

## How the numbers work

Each logo appearance gets a quality score from 0 to 1:

```
quality  = size × clarity × (1 − hidden) × placement weight
size     = √(area % ÷ 4), capped at 1
exposure = 1 − (1 − q₁)(1 − q₂)…        per sponsor, never above 1
value    = impressions ÷ 1,000 × CPM × exposure
```

A logo covering 4% of the frame or more counts in full for size. Repeat appearances add up
with diminishing returns. Each sponsor is valued against the full impressions of the post,
so a post's total can exceed impressions × CPM.

The weights (`contracts/src/index.ts`) and the per-placement CPMs (each club's rate card)
are the first things to change if you price sponsorship differently. They are a starting
position, not an industry standard.

## The synthetic data

Match images are drawn in code (`api/src/seed/scene.ts`) in each club's colours, with
invented sponsors on the boards, the shirt and the scorebug. Because the images are
generated, the ground truth is known exactly: which logo, where, how big, and how much of it
the player is standing in front of. The seeded detections are that truth with a little noise,
rather than a model's guess, so every figure in the pilot is internally consistent and no
club's photography is used.

## The analyst agent

The dashboard carries an **Ask the analyst** panel. Questions go to an agent that can
only reach your data through the platform's own MCP tools — there is no SQL tool, and no
tool takes a club id, so it can only ever answer about the club you are signed in as.

It answers in 15 to 40 seconds and streams the tools it reaches for as it works, so a
question never looks like a frozen page. Every run is written to `AgentRun`: the question,
the tools called, the answer, how long it took. An agent that can't be audited has no
business near a client's numbers.

The loop is currently the `claude` command driving the tools over MCP, which means no API
key. `api/src/agent/runner.ts` is the only file that knows that; swapping it for the
Anthropic SDK's tool runner changes nothing else. Set `HORIZM_AGENT_MODEL` to change the
model (default `sonnet`, which is quick and reads small JSON perfectly well).

## MCP: point your own agent at the platform

The same tools are served over HTTP at `POST /mcp`, always warm. To connect your own agent:

```bash
# signed in as a club, mint a token scoped to it
curl -X POST http://127.0.0.1:4000/mcp/token -b cookies.txt
```

```json
{
  "mcpServers": {
    "horizm": {
      "type": "http",
      "url": "http://127.0.0.1:4000/mcp",
      "headers": { "x-horizm-token": "<token>" }
    }
  }
}
```

Tools: `get_club`, `get_summary`, `list_sponsors`, `get_sponsor`, `list_posts`,
`get_audience`, `get_market_value`, `get_benchmarks`. All read-only, all scoped to the
token's club, and `get_benchmarks` returns the same anonymised shape as the marketplace.

There is a stdio server too (`npx tsx src/mcp/stdio.ts` with `HORIZM_ORG_ID` set) for
clients that spawn a process, but HTTP is the one to use: a spawned server was still
connecting when the first question arrived, and the model answered without its tools.

## Audience

`/audience` shows followers, 28-day reach, and the split by country, city, age band and
gender — shaped after what Instagram's insights actually return, which is **aggregate
cohorts, never individual people**.

Joining that to exposure gives value by market: the same measured exposure, distributed by
where the audience is and re-priced with each market's CPM index, because a thousand
impressions in London and a thousand in Lagos are not worth the same to a sponsor.

## The marketplace

Benchmarks are anonymised in SQL, not in the interface. The endpoint returns your value, the
cohort median and quartiles, and your percentile — never another club's name, id or figure —
and refuses to answer at all for a cohort too small to hide an individual club.

## What is staged

- **The Instagram connection.** The button switches the club's seeded feed on. Real
  integration means a Meta app, business accounts and app review.
- **Everything before today.** Posts, impressions and detections are seeded. New uploads are
  analyzed for real and stored alongside them.

## Swapping the vision model

`api/src/analyze.ts` is the only file that knows how images are read. It currently shells out
to Claude Code, which uses the sign-in on the machine and needs no API key. Replacing it with
the Anthropic SDK, or your own detector, means returning the same schema and changing nothing
else — including the front end, which only knows `contracts`.
