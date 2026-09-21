"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function Analyzer() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Upload, drop or paste an image to analyze it.");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

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
    setIsError(false);
    await analyze(next);
  }

  async function analyze(target: File | null = file) {
    if (!target || busy) return;
    setBusy(true);
    setSeconds(0);
    setIsError(false);
    setStatus("Claude is reading the image…");

    try {
      const body = new FormData();
      body.append("image", target, target.name);
      const response = await fetch("/api/v1/analyze", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as {
        postId?: string;
        detections?: number;
        error?: string;
      };

      if (!response.ok || !payload.postId) {
        setIsError(true);
        setStatus(payload.error ?? "The analysis failed. Try again.");
        return;
      }

      setStatus(`Found ${payload.detections} logo appearances. Opening the result…`);
      router.push(`/posts/${payload.postId}`);
      router.refresh();
    } catch {
      setIsError(true);
      setStatus("Can't reach the API. Check that it's running on port 4000.");
    } finally {
      setBusy(false);
    }
  }

  return (
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

      <p className={`p-3 text-sm ${isError ? "text-[var(--danger)]" : "text-[var(--muted)]"}`} role="status">
        {busy ? `${status} ${seconds}s` : status}
      </p>
    </div>
  );
}
