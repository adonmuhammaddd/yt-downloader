import Image from "next/image";
import DownloadForm from "@/components/DownloadForm";

/**
 * Page shell (server component). All interactivity lives in the client
 * <DownloadForm /> component, which renders the prereq banner, URL bar and the
 * active state directly as siblings of the header/footer inside `.app`.
 */
export default function Home() {
  return (
    <div className="page">
      <div className="app">
        <header className="header">
          <div className="brand-row">
            <Image
              className="avatar"
              src="/don-avatar-220.png"
              alt="Don, the Donloader mascot"
              width={46}
              height={46}
              priority
            />
            <div className="titles">
              <h1 className="t-main">YouTube Downloader</h1>
              <span className="t-by">
                by{" "}
                <span className="wordmark">
                  <span className="don">Don</span>
                  <span className="loader">loader</span>
                </span>
              </span>
            </div>
          </div>
          <p className="subtitle">
            Runs locally on your machine — saves to{" "}
            <span className="mono">./downloads</span> via yt-dlp&nbsp;+&nbsp;ffmpeg.
            No login, no cloud.
          </p>
        </header>

        <DownloadForm />

        <p className="footer">
          Single video only<span className="sep">·</span>720p / 1080p
          <span className="sep">·</span>runs on your machine
        </p>
      </div>
    </div>
  );
}
