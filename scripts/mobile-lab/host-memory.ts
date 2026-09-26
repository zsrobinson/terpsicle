// How much memory the browser's page processes hold, read from the host:
// Playwright's WebKit and Chromium, and the iOS Simulator's WebContent
// processes, all run as ordinary processes on the runner. A renderer that
// grows step by step, then dies, shows up here before it crashes.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Page-process names, per engine, as `ps` shows them. */
const PAGE_PROCESSES: Record<string, RegExp> = {
  webkit: /WebKitWebProcess|WPEWebProcess/,
  chromium: /chrome.*--type=renderer|chrome_crashpad|headless_shell.*renderer/,
  ios: /com\.apple\.WebKit\.WebContent/,
};

/** Resident memory of the engine's page processes, in MB (null: unknown). */
export async function pageProcessMemory(
  engine: string,
): Promise<{ processes: number; rssMb: number; largestMb: number } | null> {
  const pattern = PAGE_PROCESSES[engine];
  if (!pattern) return null;
  try {
    const { stdout } = await run("ps", ["-axo", "rss=,args="], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const sizes = stdout
      .split("\n")
      .filter((line) => pattern.test(line))
      .map((line) => Number.parseInt(line.trim(), 10) / 1024)
      .filter((mb) => Number.isFinite(mb));
    if (sizes.length === 0) return { processes: 0, rssMb: 0, largestMb: 0 };
    return {
      processes: sizes.length,
      rssMb: Math.round(sizes.reduce((a, b) => a + b, 0)),
      largestMb: Math.round(Math.max(...sizes)),
    };
  } catch {
    return null;
  }
}
