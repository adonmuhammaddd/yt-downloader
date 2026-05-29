import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { DOWNLOAD_DIR } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

/**
 * POST /api/reveal — body: { path }. Opens the OS file browser at the given
 * file's location. Only paths inside the downloads folder are permitted.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let target: unknown;
  try {
    ({ path: target } = (await req.json()) as { path?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof target !== "string" || !target) {
    return NextResponse.json({ error: "A path is required." }, { status: 400 });
  }

  // Containment check: resolved path must live inside DOWNLOAD_DIR.
  const resolved = path.resolve(target);
  const base = path.resolve(DOWNLOAD_DIR);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Path not allowed." }, { status: 403 });
  }

  const { command, args } = revealCommand(resolved);
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.unref();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not open the file location." },
      { status: 500 },
    );
  }
}

/** Returns the per-platform command to reveal a file in its folder. */
function revealCommand(target: string): { command: string; args: string[] } {
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: ["-R", target] };
    case "win32":
      return { command: "explorer", args: [`/select,${target}`] };
    default:
      // Linux: open the containing directory (no universal "select" flag).
      return { command: "xdg-open", args: [path.dirname(target)] };
  }
}
