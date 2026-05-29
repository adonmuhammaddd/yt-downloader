"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadEvent, Quality, VideoMetadata } from "@/types";

type Phase =
  | "idle"
  | "loading-meta"
  | "ready"
  | "downloading"
  | "done"
  | "error";

interface ProgressState {
  percent: number;
  speed: string | null;
  eta: string | null;
  downloaded: string | null;
  total: string | null;
  merging: boolean;
  status: string | null;
}

const EMPTY_PROGRESS: ProgressState = {
  percent: 0,
  speed: null,
  eta: null,
  downloaded: null,
  total: null,
  merging: false,
  status: null,
};

export default function DownloadForm() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("1080");
  const [phase, setPhase] = useState<Phase>("idle");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [progress, setProgress] = useState<ProgressState>(EMPTY_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filename: string; path: string } | null>(
    null,
  );
  const [binaryWarning, setBinaryWarning] = useState<string[] | null>(null);

  const sourceRef = useRef<EventSource | null>(null);

  // Check that yt-dlp + ffmpeg are available on first load.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/check");
        const data = (await res.json()) as {
          ready: boolean;
          hints: string[];
        };
        if (active && !data.ready) setBinaryWarning(data.hints);
      } catch {
        /* surfaced later by the API calls */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Close any open SSE connection on unmount.
  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  const fetchMetadata = useCallback(async () => {
    if (!url.trim()) return;
    setPhase("loading-meta");
    setError(null);
    setMetadata(null);
    setResult(null);
    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to fetch video info.");
        setPhase("error");
        return;
      }
      setMetadata(data.metadata as VideoMetadata);
      setPhase("ready");
    } catch {
      setError("Network error while fetching video info.");
      setPhase("error");
    }
  }, [url]);

  const startDownload = useCallback(() => {
    if (!metadata) return;
    setPhase("downloading");
    setProgress(EMPTY_PROGRESS);
    setError(null);
    setResult(null);

    const params = new URLSearchParams({ url, quality });
    const source = new EventSource(`/api/download?${params.toString()}`);
    sourceRef.current = source;

    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as DownloadEvent;
      switch (event.type) {
        case "status":
          setProgress((p) => ({ ...p, status: event.message }));
          break;
        case "progress":
          setProgress((p) => ({
            ...p,
            percent: event.percent,
            speed: event.speed,
            eta: event.eta,
            downloaded: event.downloaded,
            total: event.total,
            merging: false,
            status: null,
          }));
          break;
        case "merging":
          setProgress((p) => ({ ...p, percent: 100, merging: true }));
          break;
        case "done":
          setResult({ filename: event.filename, path: event.path });
          setPhase("done");
          source.close();
          sourceRef.current = null;
          break;
        case "error":
          setError(event.message);
          setPhase("error");
          source.close();
          sourceRef.current = null;
          break;
      }
    };

    // Network/connection-level failure (not an app error event).
    source.onerror = () => {
      if (sourceRef.current) {
        source.close();
        sourceRef.current = null;
        setError((prev) => prev ?? "Connection to the server was lost.");
        setPhase((prev) => (prev === "downloading" ? "error" : prev));
      }
    };
  }, [metadata, url, quality]);

  const cancelDownload = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setError("Download cancelled.");
    setPhase("error");
  }, []);

  const reset = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setPhase("idle");
    setMetadata(null);
    setProgress(EMPTY_PROGRESS);
    setError(null);
    setResult(null);
  }, []);

  const revealFile = useCallback(async (path: string) => {
    try {
      await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      /* best-effort */
    }
  }, []);

  const isBusy = phase === "downloading" || phase === "loading-meta";

  return (
    <div className="flex flex-col gap-6">
      {binaryWarning && binaryWarning.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Missing prerequisites</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {binaryWarning.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {/* URL input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isBusy) fetchMetadata();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          disabled={isBusy}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={isBusy || !url.trim()}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {phase === "loading-meta" ? "Loading…" : "Fetch info"}
        </button>
      </form>

      {/* Error banner */}
      {phase === "error" && error && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <span>{error}</span>
          <button
            onClick={reset}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Reset
          </button>
        </div>
      )}

      {/* Metadata preview + controls */}
      {metadata && phase !== "error" && (
        <div className="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex gap-4">
            {metadata.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={metadata.thumbnail}
                alt={metadata.title}
                className="h-[90px] w-40 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="line-clamp-2 text-sm font-semibold leading-snug">
                {metadata.title}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {metadata.channel}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Duration: {metadata.durationString}
              </p>
            </div>
          </div>

          {/* Quality selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Quality
            </span>
            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
              {(["720", "1080"] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={phase === "downloading"}
                  onClick={() => setQuality(q)}
                  className={`px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                    quality === q
                      ? "bg-red-600 text-white"
                      : "bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {q}p
                </button>
              ))}
            </div>
          </div>

          {/* Download / progress */}
          {phase !== "downloading" && phase !== "done" && (
            <button
              type="button"
              onClick={startDownload}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Download {quality}p
            </button>
          )}

          {phase === "downloading" && (
            <Progress
              progress={progress}
              onCancel={cancelDownload}
            />
          )}

          {phase === "done" && result && (
            <div className="flex flex-col gap-3 rounded-lg border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900/50 dark:bg-green-950/40">
              <div className="flex items-center gap-2 font-medium text-green-800 dark:text-green-300">
                <span>✓</span>
                <span>Download complete</span>
              </div>
              <p className="break-all font-mono text-xs text-neutral-600 dark:text-neutral-400">
                {result.filename}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => revealFile(result.path)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Open file location
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:text-neutral-900 dark:hover:text-white"
                >
                  Download another
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Progress bar + live speed/ETA readout with a cancel button. */
function Progress({
  progress,
  onCancel,
}: {
  progress: ProgressState;
  onCancel: () => void;
}) {
  const label = progress.merging
    ? "Merging video + audio…"
    : progress.status ?? `${progress.percent.toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{label}</span>
        <button
          type="button"
          onClick={onCancel}
          className="font-medium text-red-600 hover:underline"
        >
          Cancel
        </button>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full bg-red-600 transition-[width] duration-200 ${
            progress.merging ? "animate-pulse" : ""
          }`}
          style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
        />
      </div>
      {!progress.merging && (
        <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500">
          <span>
            {progress.downloaded ?? "—"}
            {progress.total ? ` / ${progress.total}` : ""}
          </span>
          <span>
            {progress.speed ? `${progress.speed}` : ""}
            {progress.eta ? ` · ETA ${progress.eta}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
