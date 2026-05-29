/**
 * yt-dlp orchestration layer.
 *
 * Everything that touches the `yt-dlp` / `ffmpeg` binaries lives here so that
 * route handlers stay thin. All processes are spawned with an argument array
 * (never a shell string) to avoid command injection.
 */

import { spawn } from "node:child_process";
import {
  access,
  readdir,
  stat,
  mkdir,
  rename,
  copyFile,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  BinaryCheck,
  DownloadEvent,
  Quality,
  VideoMetadata,
} from "@/types";

/**
 * Final destination folder (./downloads by default, overridable via env).
 * Finished videos are moved here.
 */
export const DOWNLOAD_DIR =
  process.env.YTDL_DOWNLOAD_DIR ?? path.join(process.cwd(), "downloads");

/**
 * Staging folder where yt-dlp actually writes (the growing video file plus its
 * temporary fragment files). It lives OUTSIDE the project tree on purpose: the
 * Next dev server (Turbopack) watches the project root, and a large binary file
 * being written there floods the file watcher and crashes the dev server with
 * an out-of-memory error. We download to ~/.cache and move the final file in.
 */
const STAGING_DIR = path.join(os.homedir(), ".cache", "yt-downloader");

/** yt-dlp format strings per selectable quality. */
const FORMAT_STRINGS: Record<Quality, string> = {
  "720": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",
  "1080":
    "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]",
};

/** Output filename template (sanitized, includes the video id). */
const OUTPUT_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

/** Sentinel-wrapped progress template so we can reliably parse each line. */
const PROGRESS_TEMPLATE =
  "download:@@@%(progress._percent_str)s|%(progress._speed_str)s|" +
  "%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|" +
  "%(progress._total_bytes_str)s@@@";

/** Thrown when a download is requested while another is already running. */
export class BusyError extends Error {
  constructor() {
    super("A download is already in progress. Please wait for it to finish.");
    this.name = "BusyError";
  }
}

/** Process-wide single-flight lock (dev server runs in one Node process). */
let busy = false;

export function isBusy(): boolean {
  return busy;
}

/** Runs a binary with a version flag and resolves true if it exits cleanly. */
function probe(bin: string, versionFlag: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, [versionFlag], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Checks that both yt-dlp and ffmpeg are available on PATH. */
export async function checkBinaries(): Promise<BinaryCheck> {
  // Note: ffmpeg uses single-dash `-version`; `--version` exits non-zero.
  const [ytdlp, ffmpeg] = await Promise.all([
    probe("yt-dlp", "--version"),
    probe("ffmpeg", "-version"),
  ]);
  return { ytdlp, ffmpeg };
}

/** Per-OS install hints for missing binaries. */
export function installHints(check: BinaryCheck): string[] {
  const hints: string[] = [];
  if (!check.ytdlp) {
    hints.push(
      "yt-dlp missing — macOS: `brew install yt-dlp` · Linux: `sudo pip install -U yt-dlp` · Windows: `winget install yt-dlp`",
    );
  }
  if (!check.ffmpeg) {
    hints.push(
      "ffmpeg missing — macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg` · Windows: `winget install ffmpeg`",
    );
  }
  return hints;
}

/** Formats a duration in seconds to "H:MM:SS" or "M:SS". */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Fetches single-video metadata via `yt-dlp --dump-single-json`.
 * Rejects with a humanized error on failure.
 */
export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  const args = [
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    url,
  ];

  return new Promise<VideoMetadata>((resolve, reject) => {
    const child = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) =>
      reject(new Error(`Failed to start yt-dlp: ${err.message}`)),
    );

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(humanizeError(stderr)));
        return;
      }
      try {
        const json = JSON.parse(stdout) as Record<string, unknown>;
        const duration =
          typeof json.duration === "number" ? json.duration : 0;
        resolve({
          id: String(json.id ?? ""),
          title: String(json.title ?? "Untitled"),
          thumbnail: pickThumbnail(json),
          duration,
          durationString:
            typeof json.duration_string === "string"
              ? json.duration_string
              : formatDuration(duration),
          channel: String(json.channel ?? json.uploader ?? "Unknown"),
          uploader: String(json.uploader ?? json.channel ?? "Unknown"),
          webpageUrl: String(json.webpage_url ?? url),
        });
      } catch {
        reject(new Error("Could not parse video metadata from yt-dlp."));
      }
    });
  });
}

/** Picks the best available thumbnail URL from the metadata JSON. */
function pickThumbnail(json: Record<string, unknown>): string {
  if (typeof json.thumbnail === "string") return json.thumbnail;
  if (Array.isArray(json.thumbnails) && json.thumbnails.length > 0) {
    const last = json.thumbnails[json.thumbnails.length - 1] as {
      url?: string;
    };
    if (last?.url) return last.url;
  }
  return "";
}

/**
 * Downloads a single video at the requested quality, merging to mp4.
 * Progress/status/error/done events are delivered via `onEvent`.
 *
 * Enforces a single-flight lock — throws {@link BusyError} if a download is
 * already running. Honors `signal` for client-disconnect cancellation.
 */
export async function downloadVideo(
  url: string,
  quality: Quality,
  onEvent: (event: DownloadEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (busy) throw new BusyError();
  busy = true;

  try {
    await mkdir(DOWNLOAD_DIR, { recursive: true });
    await mkdir(STAGING_DIR, { recursive: true });

    const args = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-f",
      FORMAT_STRINGS[quality],
      "--merge-output-format",
      "mp4",
      "--progress-template",
      PROGRESS_TEMPLATE,
      "-o",
      path.join(STAGING_DIR, OUTPUT_TEMPLATE),
      url,
    ];

    onEvent({ type: "status", message: "Starting download…" });

    await new Promise<void>((resolve, reject) => {
      const child = spawn("yt-dlp", args);
      let stderr = "";
      let capturedPath: string | null = null;

      const onAbort = () => {
        child.kill("SIGTERM");
        // Hard-kill shortly after if it ignores SIGTERM.
        setTimeout(() => child.kill("SIGKILL"), 2000);
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }

      child.stdout.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (!line.trim()) continue;
          const progress = parseProgressLine(line);
          if (progress) {
            onEvent(progress);
            continue;
          }
          const merge = line.match(/\[Merger\] Merging formats into "(.+)"/);
          if (merge) {
            capturedPath = merge[1];
            onEvent({ type: "merging", message: "Merging video + audio…" });
            continue;
          }
          const dest = line.match(/\[download\] Destination: (.+)/);
          if (dest) {
            capturedPath = dest[1];
            continue;
          }
          const already = line.match(
            /\[download\] (.+) has already been downloaded/,
          );
          if (already) {
            capturedPath = already[1];
            onEvent({ type: "status", message: "Already downloaded." });
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (err) =>
        reject(new Error(`Failed to start yt-dlp: ${err.message}`)),
      );

      child.on("close", async (code) => {
        if (signal) signal.removeEventListener("abort", onAbort);

        if (signal?.aborted) {
          reject(new Error("Download cancelled."));
          return;
        }
        if (code !== 0) {
          reject(new Error(humanizeError(stderr)));
          return;
        }

        const stagedPath = await resolveFinalPath(capturedPath, url);
        if (!stagedPath) {
          reject(
            new Error("Download finished but the output file was not found."),
          );
          return;
        }
        try {
          onEvent({ type: "merging", message: "Saving to downloads…" });
          const finalPath = await moveToDownloads(stagedPath);
          onEvent({
            type: "done",
            filename: path.basename(finalPath),
            path: finalPath,
          });
          resolve();
        } catch (err) {
          reject(
            new Error(
              `Download finished but could not be moved to downloads: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
        }
      });
    });
  } finally {
    busy = false;
  }
}

/** Parses one `--progress-template` line into a progress event, or null. */
function parseProgressLine(line: string): DownloadEvent | null {
  const match = line.match(/@@@(.+?)@@@/);
  if (!match) return null;

  const [percentRaw, speedRaw, etaRaw, downloadedRaw, totalRaw] =
    match[1].split("|");

  const percent = parseFloat((percentRaw ?? "").replace("%", "").trim());

  return {
    type: "progress",
    percent: Number.isFinite(percent) ? percent : 0,
    speed: cleanField(speedRaw),
    eta: cleanField(etaRaw),
    downloaded: cleanField(downloadedRaw),
    total: cleanField(totalRaw),
  };
}

/** Normalizes a yt-dlp `_str` field: trims and maps "unknown"/"NA" to null. */
function cleanField(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || /^(na|unknown)/i.test(v)) return null;
  return v;
}

/**
 * Determines the staged output path. Prefers the path parsed from yt-dlp
 * output; falls back to scanning the staging dir for a file containing the
 * video id, picking the most recently modified match.
 */
async function resolveFinalPath(
  captured: string | null,
  url: string,
): Promise<string | null> {
  if (captured) {
    const abs = path.isAbsolute(captured)
      ? captured
      : path.join(STAGING_DIR, captured);
    // The captured path may be a pre-merge stream; prefer the merged .mp4.
    const mp4 = abs.replace(/\.(f\d+\.)?(webm|mkv|m4a|mp4)$/i, ".mp4");
    if (await exists(mp4)) return mp4;
    if (await exists(abs)) return abs;
  }

  // Fallback: match by video id within the staging folder.
  const id = url.match(/[a-zA-Z0-9_-]{11}/g)?.pop();
  if (!id) return null;
  try {
    const files = await readdir(STAGING_DIR);
    const matches = files.filter(
      (f) => f.includes(`[${id}]`) && f.toLowerCase().endsWith(".mp4"),
    );
    if (matches.length === 0) return null;
    const withTimes = await Promise.all(
      matches.map(async (f) => {
        const p = path.join(STAGING_DIR, f);
        const st = await stat(p);
        return { p, mtime: st.mtimeMs };
      }),
    );
    withTimes.sort((a, b) => b.mtime - a.mtime);
    return withTimes[0].p;
  } catch {
    return null;
  }
}

/**
 * Moves a staged file into DOWNLOAD_DIR. Uses a fast rename when both live on
 * the same filesystem; falls back to copy + unlink across devices (EXDEV).
 * Returns the final path in DOWNLOAD_DIR.
 */
async function moveToDownloads(stagedPath: string): Promise<string> {
  const dest = path.join(DOWNLOAD_DIR, path.basename(stagedPath));
  try {
    await rename(stagedPath, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(stagedPath, dest);
      await unlink(stagedPath);
    } else {
      throw err;
    }
  }
  return dest;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Turns raw yt-dlp stderr into a concise, user-readable message. */
function humanizeError(stderr: string): string {
  const text = stderr.toLowerCase();

  if (text.includes("private video")) return "This video is private.";
  if (text.includes("members-only") || text.includes("join this channel"))
    return "This video is members-only.";
  if (
    text.includes("sign in to confirm your age") ||
    text.includes("age-restricted") ||
    text.includes("inappropriate")
  )
    return "This video is age-restricted and cannot be downloaded.";
  if (
    text.includes("not available in your country") ||
    text.includes("geo") ||
    text.includes("blocked it in your country")
  )
    return "This video is geo-blocked in your region.";
  if (
    text.includes("video unavailable") ||
    text.includes("this video is unavailable") ||
    text.includes("has been removed")
  )
    return "This video is unavailable or has been removed.";
  if (
    text.includes("urlopen error") ||
    text.includes("network") ||
    text.includes("timed out") ||
    text.includes("connection")
  )
    return "Network error — check your internet connection and try again.";
  if (text.includes("http error 429") || text.includes("too many requests"))
    return "YouTube rate-limited the request. Try again in a moment.";
  if (text.includes("requested format") || text.includes("no video formats"))
    return "The requested quality is not available for this video.";

  // Fall back to the first explicit ERROR: line, else a generic message.
  const errorLine = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toUpperCase().startsWith("ERROR:"));
  if (errorLine) return errorLine.replace(/^ERROR:\s*/i, "").trim();

  return "Download failed. See server logs for details.";
}
