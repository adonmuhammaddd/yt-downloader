import { NextResponse } from "next/server";
import { checkBinaries, fetchMetadata, installHints } from "@/lib/ytdlp";
import { isValidYouTubeUrl } from "@/lib/youtube";
import type { ApiError, MetadataResponse } from "@/types";

export const dynamic = "force-dynamic";

/** POST /api/metadata — body: { url }. Returns video metadata for preview. */
export async function POST(
  req: Request,
): Promise<NextResponse<MetadataResponse | ApiError>> {
  let url: unknown;
  try {
    ({ url } = (await req.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      { error: "A YouTube URL is required." },
      { status: 400 },
    );
  }

  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json(
      { error: "That doesn't look like a valid YouTube video URL." },
      { status: 400 },
    );
  }

  const check = await checkBinaries();
  if (!check.ytdlp) {
    return NextResponse.json(
      { error: "yt-dlp is not installed.", hints: installHints(check) },
      { status: 503 },
    );
  }

  try {
    const metadata = await fetchMetadata(url);
    return NextResponse.json({ metadata });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch metadata.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
