import { NextResponse } from "next/server";
import { checkBinaries, installHints } from "@/lib/ytdlp";
import type { BinaryCheck } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/check — reports whether yt-dlp and ffmpeg are installed. */
export async function GET(): Promise<NextResponse> {
  const check: BinaryCheck = await checkBinaries();
  return NextResponse.json({
    ...check,
    ready: check.ytdlp && check.ffmpeg,
    hints: installHints(check),
  });
}
