"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PostAnalysis from "@/components/PostAnalysis";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Detection = {
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
};

type Result = {
  postId: string;
  imageUrl: string;
  impressions: number;
  scene: string;
  detections: Detection[];
  cpmByPlacement: Record<string, number>;
  seconds: number;
};

/**
 * Upload an image, watch it being read, then see the result on this page.
 *
 * The upload returns a job rather than the answer: reading an image takes most of a
 * minute and a browser will not hold a request open that long. The page watches the job,
 * then renders the same view the post page uses, so what you see here is exactly what was
 * saved.
 */
export default function Analyzer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Upload, drop or paste an image and it's analyzed straight away.");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => () => sourceRef.current?.close(), []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const pasted = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (pasted) {
        event.preventDefault();
        void load(pasted);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function load(next: File) {
    if (busy) return;
    if (!MEDIA_TYPES.includes(next.type)) {
      setIsError(true);
      setStatus("That file type isn't supported. Use a JPEG, PNG, WebP or GIF image.");
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult(null);
    setIsError(false);
    await analyze(next);
  }

  async function analyze(target: File | null = file) {
    if (!target || busy) return;
    setBusy(true);
    setSeconds(0);
    setIsError(false);
    setResult(null);
    setStatus("Sending the image");

    try {
      const body = new FormData();
      body.append("image", target, target.name);
      const response = await fetch("/api/v1/analyze", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };

      if (!response.ok || !payload.jobId) {
        setIsError(true);
        setStatus(payload.error ?? "The upload was refused. Try another image.");
        setBusy(false);
        return;
      }

      watch(payload.jobId);
    } catch {
      setIsError(true);
      setStatus("Can't reach the API. Check that it's running on port 4000.");
      setBusy(false);
    }
  }

  function watch(jobId: string) {
    const source = new EventSource(`/api/v1/analyze/${jobId}/events`);
    sourceRef.current = source;

    source.onmessage = async (message) => {
      const event = JSON.parse(message.data) as
        | { type: "status"; message: string }
        | { type: "done"; postId: string; detections: number; scene: string; ms: number }
        | { type: "error"; message: string };

      if (event.type === "status") setStatus(event.message);

      if (event.type === "error") {
        setIsError(true);
        setStatus(event.message);
        setBusy(false);
        source.close();
      }

      if (event.type === "done") {
        source.close();
        try {
          const [detail, profile] = await Promise.all([
            fetch(`/api/v1/posts/${event.postId}`).then((response) => response.json()),
            fetch("/api/v1/org").then((response) => response.json()),
          ]);
          setResult({
            postId: event.postId,
            imageUrl: detail.post.imageUrl,
            impressions: detail.post.impressions,
            scene: detail.post.scene,
            detections: detail.detections,
            cpmByPlacement: Object.fromEntries(
              (profile.rateCard as { placement: string; cpm: number }[]).map((card) => [card.placement, card.cpm]),
            ),
            seconds: Math.round(event.ms / 1000),
          });
          setStatus(
            event.detections
              ? `Found ${event.detections} logo appearance${event.detections === 1 ? "" : "s"} in ${Math.round(event.ms / 1000)}s.`
              : `No sponsor logos found. ${event.scene}`,
          );
        } catch {
          setIsError(true);
          setStatus("The analysis finished but the result couldn't be loaded. Check the Posts tab.");
        } finally {
          setBusy(false);
        }
      }
    };

    source.onerror = () => {
      setIsError(true);
      setStatus("Lost the connection while analyzing. Check the Posts tab, it may have finished.");
      setBusy(false);
      source.close();
    };
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-md border border-[var(--rule)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] p-3">
          <p className="text-sm text-[var(--muted)]">{file ? file.name : "No image loaded"}</p>
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded border border-[var(--rule)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Upload image
            </button>
            <button
              onClick={() => analyze()}
              disabled={busy || !file}
              className="rounded bg-[var(--turf)] px-4 py-2 text-sm font-semibold text-[var(--on-turf)] disabled:opacity-50"
            >
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={MEDIA_TYPES.join(",")}
            hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void load(chosen);
              event.target.value = "";
            }}
          />
        </div>

        {/* While it works, show the image being read. Once it's done, the full result
            replaces this with pins on the same image. */}
        {!result ? (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) void load(dropped);
              else {
                setIsError(true);
                setStatus("That drop didn't include an image file. Copy the image and press Ctrl+V, or use Upload image.");
              }
            }}
            className="grid min-h-60 place-items-center bg-[var(--monitor)] p-4"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className={`max-h-[60vh] w-auto rounded ${busy ? "opacity-70" : ""}`} />
            ) : (
              <p className="display text-2xl text-white/50">Drop an image here</p>
            )}
          </div>
        ) : null}

        <p className={`p-3 text-sm ${isError ? "text-[var(--danger)]" : "text-[var(--muted)]"}`} role="status">
          {busy ? `${status}… ${seconds}s` : status}
        </p>
      </div>

      {result ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">
              Analyzed in {result.seconds}s · saved to your posts
            </p>
            <Link href={`/posts/${result.postId}`} className="text-sm text-[var(--muted)] hover:text-[var(--turf)]">
              Open as a post
            </Link>
          </div>
          <PostAnalysis
            imageUrl={result.imageUrl}
            impressions={result.impressions}
            scene={result.scene}
            detections={result.detections}
            cpmByPlacement={result.cpmByPlacement}
          />
        </>
      ) : null}
    </div>
  );
}
