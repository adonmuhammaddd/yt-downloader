/**
 * Centralized type definitions for the local YouTube downloader.
 */

/** Selectable download qualities (height cap). */
export type Quality = "720" | "1080";

/** Metadata returned from `yt-dlp --dump-single-json`. */
export interface VideoMetadata {
  id: string;
  title: string;
  thumbnail: string;
  /** Duration in seconds. */
  duration: number;
  /** Human-readable duration, e.g. "12:34". */
  durationString: string;
  channel: string;
  uploader: string;
  webpageUrl: string;
}

/** Whether the required external binaries are available on PATH. */
export interface BinaryCheck {
  ytdlp: boolean;
  ffmpeg: boolean;
}

/**
 * Structured events streamed from the server to the client over SSE
 * while a download is in progress.
 */
export type DownloadEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      /** 0–100. */
      percent: number;
      /** e.g. "1.23MiB/s" or null when unknown. */
      speed: string | null;
      /** e.g. "00:12" or null when unknown. */
      eta: string | null;
      /** e.g. "12.3MiB" or null when unknown. */
      downloaded: string | null;
      /** e.g. "120.0MiB" or null when unknown. */
      total: string | null;
    }
  | { type: "merging"; message: string }
  | { type: "done"; filename: string; path: string }
  | { type: "error"; message: string };

/** Successful metadata API response. */
export interface MetadataResponse {
  metadata: VideoMetadata;
}

/** Generic API error response. */
export interface ApiError {
  error: string;
  /** Optional install hints when a binary is missing. */
  hints?: string[];
}
