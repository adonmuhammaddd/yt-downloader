# YouTube Downloader — Redesign Brief (for Claude Design)

> Paste the prompt below into **claude.ai/design**. Export the handoff `.zip`
> into this project folder afterward. English is used for the prompt because
> Claude Design is more consistent in English — feel free to translate.

---

## The prompt

```
Redesign a desktop web app called "YouTube Downloader" — a local-only tool that
downloads a single YouTube video to the user's machine via yt-dlp + ffmpeg. No
login, no cloud, no database. One person, one machine, one task: paste a URL →
preview → pick quality → download → done.

GOAL OF REDESIGN
Keep the app minimal and zero-friction, but elevate the visual polish:
stronger typographic hierarchy, more refined spacing, a more modern/premium
feel. It should feel like a calm, focused single-purpose utility — NOT a
dashboard. One centered column, ~max 640px wide. Think Linear / Vercel /
Raycast level of restraint and craft, with a touch of friendly personality
from the mascot (see BRAND).

BRAND
- The app's personality name is "Donloader" — an intentional play on words
  combining the owner's name "Don" with "Down(load)". This is deliberate, not a
  typo. Feel free to lean into it: use "Donloader" as a friendly wordmark /
  logotype, and let it carry a light, personable tone (the mascot IS Don).
  Subtle wink, not a gimmick — the product is still "YouTube Downloader" but
  "Donloader" can appear as the brand/logo and in friendly microcopy.
- The app has a mascot/avatar named Don: a friendly 3D-rendered character
  (Memoji-like style) — a young man with curly black hair and a light
  mustache/goatee, wearing a black hoodie with a small red download icon on it,
  holding a red YouTube play button and giving a thumbs up. Warm, approachable,
  a bit playful. The file is "yt-donloader.png".
- Use the mascot as the app's identity: as the header/app icon (e.g. a rounded
  avatar next to the title), and optionally as a friendly empty-state
  illustration on the idle screen. Keep it tasteful — one or two placements,
  not everywhere. The UI itself stays clean and minimal; the mascot adds the
  warmth.
- Design the layout so the mascot image can be dropped in as an <img> asset
  (provide a placeholder/spot for it in the mockups).

COLOR
- Primary action color: red (YouTube-ish red, ~#dc2626). Use it sparingly for
  the main download CTA, active states, focus rings, progress fill — and it
  echoes the mascot's red play button / download icon.
- Neutral grayscale for everything else.
- Status colors: green = success, red = error, amber = warning.
- Light mode: white bg / near-black text. Dark mode: near-black (#0a0a0a) bg /
  light-gray text.

TECH CONSTRAINTS (the handoff will be implemented in this stack — design for it)
- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- Fonts: Geist Sans (UI) + Geist Mono (filenames/code)
- No external UI component library — plain HTML + Tailwind
- Must support BOTH light and dark mode (follows OS preference)
- Responsive: clean on desktop, still usable on a narrow window / mobile

SCREENS & STATES (design every one of these — they're the same single view
transitioning through phases):

1. IDLE / EMPTY
   - App header: the mascot avatar + title "YouTube Downloader", subtitle
     explaining it's local-only and saves to a ./downloads folder via
     yt-dlp + ffmpeg.
   - A URL input field (placeholder: https://www.youtube.com/watch?v=…) with a
     "Fetch info" button beside it (disabled until a URL is typed).
   - Optional friendly empty-state using the mascot.
   - Footer microcopy: "Single video only · 720p / 1080p · runs on your machine"

2. PREREQUISITE WARNING (optional banner at top)
   - Amber banner "Missing prerequisites" with an OS-specific install hint list
     for yt-dlp / ffmpeg (shown only if a tool isn't installed).

3. LOADING METADATA
   - Input + button disabled, button shows "Loading…". Show a tasteful loading
     state (skeleton for the upcoming preview card is ideal).

4. READY / PREVIEW
   - A preview card showing: video thumbnail (16:9), title (2-line clamp),
     channel name, duration.
   - A quality selector — a segmented toggle with two options: 720p and 1080p
     (1080p default, selected state uses the red accent).
   - A primary "Download 1080p" / "Download 720p" button (text updates with
     selection).

5. DOWNLOADING (live progress)
   - A progress bar (red fill) with percent.
   - A details line: downloaded / total size · speed (e.g. 2.3MiB/s) · ETA
     (e.g. 00:35).
   - A "Cancel" control.
   - A special sub-state "Merging video + audio…" (for 1080p) where the bar
     pulses and speed/ETA are hidden.

6. DONE / SUCCESS
   - Green success banner "Download complete" with the saved filename shown in
     monospace (Geist Mono, can be long — handle wrapping).
   - Two actions: "Open file location" (secondary) and "Download another"
     (tertiary/text).
   - Optional: a happy/thumbs-up mascot moment here.

7. ERROR
   - Red error banner with a human-readable message (e.g. "This video is
     private.", "Network error — check your internet connection and try again.")
     and a "Reset" action.

COMPONENTS TO DEFINE AS REUSABLE PIECES
- Text input + attached primary button (the URL bar)
- Segmented quality toggle (720p / 1080p)
- Primary button (red), secondary button (outline/neutral), tertiary text button
- Status banners: success (green), error (red), warning (amber)
- Video preview card (thumbnail + meta)
- Progress bar + details row
- App header (mascot avatar + title + subtitle) and footer microcopy

DELIVERABLE
Provide a complete, polished design covering all 7 states above plus the
reusable components, in both light and dark mode, ready to hand off to a
React + Tailwind v4 implementation. Include the spacing scale, type scale,
radius, and color tokens you use.
```

---

## Tips for a better result

- After the first generation, **iterate**: ask it to show all 7 states, both
  dark + light mode, and a separate component-library page — the first pass
  often only renders the happy path.
- The mascot file is **`yt-donloader.png`** (in this project root). In Claude
  Design, upload it so it can place it for real instead of a placeholder.
- When exporting, drop the handoff `.zip` into this project folder
  (`/Users/DonDev/Projects/yt-downloader`), then tell Claude Code where it is —
  it'll translate the handoff into the existing React + Tailwind v4 components
  (`src/components/DownloadForm.tsx`, `src/app/page.tsx`, `src/app/globals.css`).

---

## Current app reference (so the redesign keeps behavior intact)

- **Stack:** Next.js 16 · React 19 · Tailwind v4 · Geist Sans/Mono. No UI kit.
- **Flow:** paste URL → Fetch info → preview card → pick 720p/1080p → download
  with live SSE progress → success (open file / download another). Single
  download at a time.
- **Quality:** 720p and 1080p only (1080p = separate video+audio merged by
  ffmpeg → the "Merging video + audio…" sub-state).
- **Metadata shown:** thumbnail, title, channel, duration.
- **Progress shown:** percent, downloaded/total bytes, speed, ETA.
- **States:** idle · loading-meta · ready · downloading · merging · done · error
  · missing-prerequisites.
- **Output:** saved as `Title [videoID].mp4` into `./downloads`.
