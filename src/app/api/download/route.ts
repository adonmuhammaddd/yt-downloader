import { BusyError, checkBinaries, downloadVideo } from "@/lib/ytdlp";
import { isValidYouTubeUrl } from "@/lib/youtube";
import type { DownloadEvent, Quality } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/download?url=...&quality=720|1080
 *
 * Streams download progress as Server-Sent Events. The client connects with
 * an EventSource; we forward structured {@link DownloadEvent}s as they occur.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") ?? "";
  const qualityParam = searchParams.get("quality") ?? "";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: DownloadEvent) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // --- Validation ---
      if (!isValidYouTubeUrl(url)) {
        send({ type: "error", message: "Invalid YouTube URL." });
        close();
        return;
      }
      if (qualityParam !== "720" && qualityParam !== "1080") {
        send({ type: "error", message: "Invalid quality (use 720 or 1080)." });
        close();
        return;
      }
      const quality = qualityParam as Quality;

      const check = await checkBinaries();
      if (!check.ytdlp || !check.ffmpeg) {
        const missing = [
          !check.ytdlp ? "yt-dlp" : null,
          !check.ffmpeg ? "ffmpeg" : null,
        ]
          .filter(Boolean)
          .join(" and ");
        send({
          type: "error",
          message: `Missing required binary: ${missing}.`,
        });
        close();
        return;
      }

      // --- Run download ---
      try {
        await downloadVideo(url, quality, send, req.signal);
      } catch (err) {
        if (err instanceof BusyError) {
          send({ type: "error", message: err.message });
        } else if (!req.signal.aborted) {
          const message =
            err instanceof Error ? err.message : "Download failed.";
          send({ type: "error", message });
        }
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
