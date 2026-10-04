// Git keeps every version of every file forever, so recordings, screenshots
// of test runs and other large outputs belong in Actions artifacts or R2,
// never in a commit. The mobile lab's recordings once grew the repo past
// 400 MiB (docs/decisions.md, "Test recordings stay out of Git").
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { isMain, ROOT, report } from "./lib/source-files";

/** The largest file a commit may add. Today's largest is under 1 MiB. */
export const MAX_BYTES = 2 * 1024 * 1024;

const OUTPUT_DIRS =
  /^(runs|mobile-lab-results|test-results|playwright-report)\//;
const RECORDING = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;

export interface TrackedFile {
  /** Path relative to the repo root, with forward slashes. */
  rel: string;
  bytes: number;
}

export function findTrackedFileProblems(files: TrackedFile[]): string[] {
  return files.flatMap(({ rel, bytes }) => {
    if (OUTPUT_DIRS.test(rel)) return [`${rel}  (a test run's output)`];
    if (RECORDING.test(rel)) return [`${rel}  (a recording)`];
    if (bytes > MAX_BYTES)
      return [`${rel}  (${(bytes / 1024 / 1024).toFixed(1)} MiB)`];
    return [];
  });
}

if (isMain(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
    .toString()
    .split("\0")
    .filter(Boolean)
    .flatMap((rel) => {
      // A deleted file that's still in the index has nothing to measure.
      try {
        return [{ rel, bytes: statSync(path.join(ROOT, rel)).size }];
      } catch {
        return [];
      }
    });
  report(
    "tracked files",
    findTrackedFileProblems(files),
    "Keep test output, recordings and files over 2 MiB out of Git: upload them as an Actions artifact (actions/upload-artifact) or to R2.",
  );
}
