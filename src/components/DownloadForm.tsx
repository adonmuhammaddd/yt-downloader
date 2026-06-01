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

const QUALITY_OPTIONS: { value: Quality; sub: string }[] = [
  { value: "720", sub: "HD · smaller file" },
  { value: "1080", sub: "Full HD · recommended" },
];

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
        const data = (await res.json()) as { ready: boolean; hints: string[] };
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
    setUrl("");
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
  const showUrlBar =
    phase === "idle" || phase === "loading-meta" || phase === "ready";

  return (
    <>
      {/* Prereq warning */}
      {binaryWarning && binaryWarning.length > 0 && (
        <div className="banner warning">
          <AlertTriangleIcon />
          <div className="b-body">
            <span className="b-title">Missing prerequisites</span>
            <span className="b-text">
              Donloader needs these command-line tools installed. Install them,
              then restart the app.
            </span>
            <ul className="prereq-list">
              {binaryWarning.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* URL bar */}
      {showUrlBar && (
        <form
          className="urlbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isBusy) fetchMetadata();
          }}
        >
          <label className="field">
            <LinkIcon />
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={isBusy}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isBusy || !url.trim()}
            data-loading={phase === "loading-meta" ? "true" : undefined}
          >
            {phase === "loading-meta" ? (
              <>
                <span className="spin" />
                Loading…
              </>
            ) : (
              "Fetch info"
            )}
          </button>
        </form>
      )}

      {/* IDLE — empty state */}
      {phase === "idle" && (
        <section className="state">
          <div className="empty">
            <div className="empty-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/don-512.png" alt="Don holding a play button, thumbs up" />
            </div>
            <div className="empty-copy">
              <p className="lead">Paste a link to get started.</p>
              <p className="sub">
                Drop in any YouTube video URL and Don will grab a clean copy —
                preview first, pick your quality, download.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* LOADING — skeleton */}
      {phase === "loading-meta" && (
        <section className="state">
          <div className="card">
            <div className="skel skel-thumb" />
            <div className="card-body" style={{ gap: 12 }}>
              <div className="skel skel-line" style={{ width: "88%" }} />
              <div className="skel skel-line" style={{ width: "54%" }} />
              <div
                className="skel skel-line"
                style={{ width: "38%", height: 12, marginTop: 4 }}
              />
            </div>
          </div>
        </section>
      )}

      {/* READY — preview + quality + download */}
      {phase === "ready" && metadata && (
        <section className="state">
          <div className="card">
            <div className="thumb">
              {metadata.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={metadata.thumbnail} alt={metadata.title} />
              )}
              {metadata.durationString && (
                <span className="dur">{metadata.durationString}</span>
              )}
            </div>
            <div className="card-body">
              <div className="v-title">{metadata.title}</div>
              <div className="v-meta">
                <span className="chan">
                  <span className="dot" />
                  <span className="label">{metadata.channel}</span>
                </span>
                {metadata.durationString && (
                  <>
                    <span className="sep" />
                    <span>{metadata.durationString}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="q-label">Quality</div>
            <div className="segmented" role="radiogroup" aria-label="Quality">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="seg"
                  role="radio"
                  aria-checked={quality === opt.value}
                  onClick={() => setQuality(opt.value)}
                >
                  <span className="seg-q">{opt.value}p</span>
                  <span className="seg-sub">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={startDownload}
          >
            <DownloadIcon />
            Download {quality}p
          </button>
        </section>
      )}

      {/* DOWNLOADING / MERGING — progress */}
      {phase === "downloading" && (
        <section className="state">
          <div className="card" style={{ padding: "var(--sp-5)" }}>
            <div className="progress-head">
              <div className="mini-thumb">
                {metadata?.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={metadata.thumbnail} alt="" />
                )}
              </div>
              <div className="pinfo">
                <div className="pt">{metadata?.title ?? "Downloading…"}</div>
                <div className="ps">
                  {progress.merging
                    ? "Merging video + audio…"
                    : progress.status ?? "Downloading"}{" "}
                  <span style={{ color: "var(--text-faint)" }}>· {quality}p</span>
                </div>
              </div>
              {!progress.merging && (
                <div className="pct">{Math.round(progress.percent)}%</div>
              )}
            </div>

            <div className={`bar${progress.merging ? " pulse" : ""}`}>
              <div
                className="fill"
                style={
                  progress.merging
                    ? undefined
                    : {
                        width: `${Math.min(
                          100,
                          Math.max(2, progress.percent),
                        )}%`,
                      }
                }
              />
            </div>

            <div className="details">
              {progress.merging ? (
                <span className="merge-note">
                  <span
                    className="spin"
                    style={{ width: 13, height: 13, borderWidth: 2 }}
                  />
                  ffmpeg is combining streams
                </span>
              ) : (
                <>
                  <span>
                    {progress.downloaded ?? "—"}
                    {progress.total ? ` / ${progress.total}` : ""}
                  </span>
                  <span>
                    {progress.speed ?? ""}
                    {progress.eta ? ` · ETA ${progress.eta}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="prow">
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-faint)" }}>
              Keep this window open while downloading.
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 40, padding: "0 16px" }}
              onClick={cancelDownload}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* DONE — success */}
      {phase === "done" && result && (
        <section className="state">
          <div className="banner success">
            <CheckIcon />
            <div className="b-body">
              <span className="b-title">Download complete</span>
              <span className="b-text">
                Saved to your{" "}
                <span className="mono" style={{ fontSize: "var(--fs-xs)" }}>
                  ./downloads
                </span>{" "}
                folder.
              </span>
            </div>
          </div>
          <div className="filebox">
            <FileIcon />
            <span className="fname">{result.filename}</span>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => revealFile(result.path)}
            >
              <FolderIcon />
              Open file location
            </button>
            <button type="button" className="btn btn-tertiary" onClick={reset}>
              Download another
            </button>
          </div>
          <div className="done-mascot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/don-512.png" alt="Don thumbs up" />
            <span>Nice one. Don filed it away for you. 👍</span>
          </div>
        </section>
      )}

      {/* ERROR */}
      {phase === "error" && error && (
        <section className="state">
          <div className="banner error">
            <AlertCircleIcon />
            <div className="b-body">
              <span className="b-title">{error}</span>
            </div>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={reset}
            >
              <ResetIcon />
              Reset
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/* ---------- icons ---------- */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function LinkIcon() {
  return (
    <svg className="f-icon" viewBox="0 0 24 24" {...stroke}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" {...stroke}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="b-icon" viewBox="0 0 24 24" {...stroke}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function AlertTriangleIcon() {
  return (
    <svg className="b-icon" viewBox="0 0 24 24" {...stroke}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function AlertCircleIcon() {
  return (
    <svg className="b-icon" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg className="fi" viewBox="0 0 24 24" {...stroke}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
