/**
 * YouTube URL validation helpers.
 *
 * Kept deliberately strict but permissive enough for the common URL shapes:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtube.com/watch?v=ID
 *   - https://m.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/live/ID
 */

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/** Returns true when `input` is a syntactically valid single-video YouTube URL. */
export function isValidYouTubeUrl(input: string): boolean {
  return extractVideoId(input) !== null;
}

/**
 * Extracts the 11-character video id from a YouTube URL, or null if the URL
 * is not a recognizable single-video YouTube link.
 */
export function extractVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return isValidId(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id && isValidId(id) ? id : null;
  }

  // youtube.com/shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 2 &&
    ["shorts", "embed", "live", "v"].includes(segments[0])
  ) {
    return isValidId(segments[1]) ? segments[1] : null;
  }

  return null;
}

function isValidId(id: string | undefined): id is string {
  return !!id && /^[a-zA-Z0-9_-]{11}$/.test(id);
}
