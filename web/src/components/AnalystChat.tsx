"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";

const TOOL_LABELS: Record<string, string> = {
  get_club: "Checking the rate card",
  get_summary: "Reading the exposure summary",
  list_sponsors: "Pulling the sponsor table",
  get_sponsor: "Looking into one sponsor",
  list_posts: "Going through recent posts",
  get_audience: "Reading the audience breakdown",
  get_market_value: "Splitting value by market",
  get_benchmarks: "Comparing against the cohort",
  ToolSearch: "Loading the platform tools",
};

const STARTERS = [
  "Which sponsor is getting the least for their money?",
  "Where is our exposure landing by country?",
  "Which week was our worst, and what happened?",
  "How do we compare with the rest of the division?",
];

type Turn = {
  role: "you" | "analyst";
  text: string;
  tools?: string[];
  seconds?: number;
  failed?: boolean;
};

/** Renders the analyst's markdown; tags are stripped before parsing. */
function Answer({ text }: { text: string }) {
  return <div className="answer" dangerouslySetInnerHTML={{ __html: marked.parse(text.replace(/<[^>]*>/g, ""), { async: false }) }} />;
}

/**
 * A conversation with the analyst.
 *
 * Follow-ups continue the same session, so "and the month before?" costs one round
 * instead of re-reading every tool. The tools it reaches for are shown as it works,
 * because a question can take half a minute and a still page looks broken.
 */
export default function AnalystChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingTools, setPendingTools] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const sessionRef = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pendingTools, busy]);

  useEffect(() => () => sourceRef.current?.close(), []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setTurns((current) => [...current, { role: "you", text: trimmed }]);
    setQuestion("");
    setPendingTools([]);
    setSeconds(0);
    setBusy(true);

    const params = new URLSearchParams({ q: trimmed });
    if (sessionRef.current) params.set("session", sessionRef.current);
    const source = new EventSource(`/api/v1/agent/ask?${params}`);
    sourceRef.current = source;

    const toolsThisTurn: string[] = [];
    let streamed = "";

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as
        | { type: "tool"; name: string }
        | { type: "text"; text: string }
        | { type: "done"; text: string; ms: number; sessionId: string | null }
        | { type: "error"; message: string };

      if (event.type === "tool") {
        toolsThisTurn.push(event.name);
        setPendingTools([...toolsThisTurn]);
      }

      if (event.type === "text") streamed = event.text;

      if (event.type === "done") {
        sessionRef.current = event.sessionId ?? sessionRef.current;
        setTurns((current) => [
          ...current,
          { role: "analyst", text: event.text || streamed, tools: toolsThisTurn, seconds: Math.round(event.ms / 1000) },
        ]);
        setPendingTools([]);
        setBusy(false);
        source.close();
      }

      if (event.type === "error") {
        setTurns((current) => [...current, { role: "analyst", text: event.message, failed: true }]);
        setPendingTools([]);
        setBusy(false);
        source.close();
      }
    };

    source.onerror = () => {
      setTurns((current) => [
        ...current,
        { role: "analyst", text: "Lost the connection to the analyst. Ask again.", failed: true },
      ]);
      setBusy(false);
      source.close();
    };
  }

  function reset() {
    sourceRef.current?.close();
    sessionRef.current = null;
    setTurns([]);
    setPendingTools([]);
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <div className="min-h-[50vh] rounded-md border border-[var(--rule)] bg-[var(--surface)] p-5">
        {!turns.length && !busy ? (
          <div className="grid gap-4">
            <p className="text-[var(--muted)]">
              Ask about sponsors, posts, audience or how you compare. The analyst reads your data with the
              platform&apos;s own tools and will say when the data can&apos;t answer something.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  onClick={() => send(starter)}
                  className="rounded-full border border-[var(--rule)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--muted)]"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-5">
          {turns.map((turn, i) =>
            turn.role === "you" ? (
              <div key={i} className="justify-self-end rounded-lg bg-[var(--turf-soft)] px-4 py-2 text-[15px]">
                {turn.text}
              </div>
            ) : (
              <div key={i} className="grid gap-1">
                {turn.tools?.length ? (
                  <p className="label !normal-case !tracking-normal">
                    {turn.tools.map((tool) => TOOL_LABELS[tool] ?? tool).join(" · ")}
                    {turn.seconds ? ` · ${turn.seconds}s` : ""}
                  </p>
                ) : null}
                {turn.failed ? (
                  <p className="text-[15px] text-[var(--danger)]">{turn.text}</p>
                ) : (
                  <div className="text-[15px] leading-relaxed">
                    <Answer text={turn.text} />
                  </div>
                )}
              </div>
            ),
          )}

          {busy ? (
            <div className="grid gap-1">
              {pendingTools.map((tool, i) => (
                <p key={`${tool}-${i}`} className="label !normal-case !tracking-normal">
                  {TOOL_LABELS[tool] ?? tool}
                </p>
              ))}
              <p className="text-[15px] text-[var(--muted)]">Thinking… {seconds}s</p>
            </div>
          ) : null}
        </div>
        <div ref={bottomRef} />
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={turns.length ? "Ask a follow-up…" : "Ask about your sponsors…"}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-[var(--rule)] bg-[var(--surface)] px-3 py-2.5"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded bg-[var(--turf)] px-5 py-2.5 font-semibold text-[var(--on-turf)] disabled:opacity-50"
        >
          {busy ? `Thinking… ${seconds}s` : "Ask"}
        </button>
        {turns.length ? (
          <button type="button" onClick={reset} className="rounded border border-[var(--rule)] px-4 py-2.5 text-sm">
            New conversation
          </button>
        ) : null}
      </form>

      <style>{`
        .answer p { margin-bottom: 0.6rem; }
        .answer p:last-child { margin-bottom: 0; }
        .answer ul { list-style: disc; padding-left: 1.2rem; margin-bottom: 0.6rem; }
        .answer li { margin-bottom: 0.2rem; }
        .answer table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 0.8rem; font-variant-numeric: tabular-nums; }
        .answer th { text-align: left; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding-bottom: 0.3rem; }
        .answer td { border-top: 1px solid var(--rule); padding: 0.4rem 0.6rem 0.4rem 0; }
        .answer strong { font-weight: 600; }
      `}</style>
    </div>
  );
}
