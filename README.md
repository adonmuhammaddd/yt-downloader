# YouTube Downloader (local-only)

A small, single-page web app for downloading individual YouTube videos to a
local `./downloads` folder. Built with **Next.js 16 (App Router) + TypeScript +
Tailwind**, using **yt-dlp** as the download engine and **ffmpeg** for merging
1080p video+audio streams.

It runs entirely on your machine — no auth, no database, no deployment.

## Features

- Paste a YouTube URL and preview metadata (title, thumbnail, duration, channel)
  before committing to a download.
- Quality selector: **720p** or **1080p** (1080p is merged from separate
  video/audio streams via ffmpeg).
- **Live progress** (percent, speed, ETA) streamed to the UI over SSE.
- Success state with the output filename and an **Open file location** button.
- Clear, humanized errors for private/geo-blocked/age-restricted/unavailable
  videos and network failures.
- One download at a time (single-flight lock) — no SSE race conditions.

## Prerequisites

You need **yt-dlp** and **ffmpeg** on your `PATH`. The app checks on load and
shows install hints if either is missing.

### macOS (Homebrew)

```bash
brew install yt-dlp ffmpeg
```

### Linux

```bash
# yt-dlp
sudo pip install -U yt-dlp        # or: sudo apt install yt-dlp
# ffmpeg
sudo apt install ffmpeg           # Debian/Ubuntu
```

### Windows

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg        # or: ffmpeg.ffmpeg
```

Verify:

```bash
yt-dlp --version
ffmpeg -version
```

> Tip: keep yt-dlp current with `yt-dlp -U` — YouTube changes break older
> versions regularly.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Downloads are saved to `./downloads/` as `Title [videoId].mp4`.

### Production build

```bash
npm run build
npm start
```

## How it works

| Path                              | Responsibility                                         |
| --------------------------------- | ------------------------------------------------------ |
| `src/types/index.ts`              | Centralized TypeScript interfaces                      |
| `src/lib/youtube.ts`              | YouTube URL validation / video-id extraction           |
| `src/lib/ytdlp.ts`                | yt-dlp orchestration: binary check, metadata, download |
| `src/app/api/check`               | `GET` — reports yt-dlp/ffmpeg availability             |
| `src/app/api/metadata`            | `POST` — fetches video metadata for preview            |
| `src/app/api/download`            | `GET` (SSE) — streams live download progress           |
| `src/app/api/reveal`              | `POST` — opens the file location in your OS browser    |
| `src/app/page.tsx`                | Server-component page shell                            |
| `src/components/DownloadForm.tsx` | Client component: form, progress, result state         |

### yt-dlp format strings

- **720p:** `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]`
- **1080p:** `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]`

Both pass `--merge-output-format mp4`. Progress is parsed from a custom
`--progress-template` with `--newline`.

## Non-goals

No playlists, no audio-only/other formats, no auth, no database, no Docker.
This is a personal, local tool.
