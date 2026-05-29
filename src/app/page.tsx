import DownloadForm from "@/components/DownloadForm";

/**
 * Page shell (server component). All interactivity lives in the client
 * <DownloadForm /> component.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10 sm:py-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-lg font-bold text-white">
            ▶
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            YouTube Downloader
          </h1>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Local-only. Paste a video URL, pick a quality, and it saves to your{" "}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs dark:bg-neutral-800">
            ./downloads
          </code>{" "}
          folder via yt-dlp + ffmpeg.
        </p>
      </header>

      <DownloadForm />

      <footer className="mt-auto pt-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
        Single video only · 720p / 1080p · runs on your machine
      </footer>
    </main>
  );
}
