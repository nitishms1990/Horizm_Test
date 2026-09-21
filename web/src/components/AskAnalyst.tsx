"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";

/** Tool names the agent may call, in words a commercial director would use. */
const TOOL_LABELS: Record<string, string> = {
  get_club: "Checking the rate card",
  get_summary: "Reading the exposure summary",
  list_sponsors: "Pulling the sponsor table",
  get_sponsor: "Looking into one sponsor",
  list_posts: "Going through recent posts",
  get_audience: "Reading the audience breakdown",
  get_market_value: "Splitting value by market",
  get_benchmarks: "Comparing against the cohort",
};

const SUGGESTIONS = [
  "Which sponsor is getting the least for their money?",
  "Where is our exposure landing by country?",
  "Did our sponsor value drop in the last three weeks, and why?",
  "How do we compare with the rest of the division?",
];

type Step = { name: string; label: string };

/**
 * The analyst panel.
 *
 * Questions go to the agent over server-sent events so the tools it reaches for appear
 * as it works; a question that takes a minute shouldn't look like a frozen page.
 */
export default function AskAnalyst() {
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => () => sourceRef.current?.close(), []);

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setQuestion(trimmed);
    setSteps([]);
    setAnswer("");
    setError(null);
    setSeconds(0);
    setBusy(true);

    const source = new EventSource(`/api/v1/agent/ask?q=${encodeURIComponent(trimmed)}`);
    sourceRef.current = source;

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as
        | { type: "tool"; name: string }
        | { type: "text"; text: string }
        | { type: "done"; text: string; ms: number }
        | { type: "error"; message: string };

      if (event.type === "tool") {
        setSteps((current) => [...current, { name: event.name, label: TOOL_LABELS[event.name] ?? event.name }]);
      }
      if (event.type === "text") setAnswer(event.text);
      if (event.type === "done") {
        setAnswer(event.text);
        setBusy(false);
        source.close();
      }
      if (event.type === "error") {
        setError(event.message);
        setBusy(false);
        source.close();
      }
    };

    source.onerror = () => {
      if (!answer) setError("Lost the connection to the analyst. Try again.");
      setBusy(false);
      source.close();
    };
  }

  // The answer is markdown from the model; strip any tags before rendering it.
  const html = answer ? marked.parse(answer.replace(/<[^>]*>/g, ""), { async: false }) : "";

  return (
    <section className="rounded-md border border-[var(--rule)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="display text-xl font-semibold">Ask the analyst</h2>
        <span className="label">Reads your data with the platform&apos;s own tools</span>
      </div>

      <form
        className="flex flex-wrap gap-2 px-5 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which sponsor is underdelivering?"
          className="min-w-0 flex-1 rounded border border-[var(--rule)] bg-[var(--ground)] px-3 py-2"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded bg-[var(--turf)] px-4 py-2 font-semibold text-[var(--on-turf)] disabled:opacity-50"
        >
          {busy ? `Thinking… ${seconds}s` : "Ask"}
        </button>
      </form>

      {!answer && !busy && !error ? (
        <div className="flex flex-wrap gap-2 px-5 pt-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => ask(suggestion)}
              className="rounded-full border border-[var(--rule)] px-3 py-1 text-sm text-[var(--muted)] hover:border-[var(--muted)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {steps.length ? (
        <ul className="px-5 pt-4">
          {steps.map((step, i) => (
            <li key={`${step.name}-${i}`} className="label !normal-case !tracking-normal py-0.5">
              {step.label}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="px-5 pt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {html ? (
        <div
          className="answer px-5 pb-5 pt-3 text-[15px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="pb-5" />
      )}

      <style>{`
        .answer p { margin-bottom: 0.6rem; }
        .answer ul { list-style: disc; padding-left: 1.2rem; margin-bottom: 0.6rem; }
        .answer li { margin-bottom: 0.2rem; }
        .answer table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 0.8rem; font-variant-numeric: tabular-nums; }
        .answer th { text-align: left; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding-bottom: 0.3rem; }
        .answer td { border-top: 1px solid var(--rule); padding: 0.4rem 0.6rem 0.4rem 0; }
        .answer strong { font-weight: 600; }
      `}</style>
    </section>
  );
}
