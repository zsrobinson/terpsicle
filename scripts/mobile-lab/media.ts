// Screenshots and recordings, made small enough to keep a few dozen runs on
// the mobile-runs branch: JPEGs at most 720px wide, videos at 360px. Uses
// whichever converter the machine has (ffmpeg; on a Mac, sips and
// avconvert) and keeps the original when none works.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const FFMPEG = process.env.MOBILE_LAB_FFMPEG ?? "ffmpeg";

function runs(command: string, args: string[]): boolean {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

let imageTool: "ffmpeg" | "sips" | null | undefined;

function toJpeg(png: string, jpg: string): boolean {
  const tools: ("ffmpeg" | "sips")[] =
    imageTool === undefined ? ["ffmpeg", "sips"] : imageTool ? [imageTool] : [];
  for (const tool of tools) {
    const ok =
      tool === "ffmpeg"
        ? runs(FFMPEG, [
            "-y",
            "-loglevel",
            "error",
            "-i",
            png,
            "-vf",
            "scale='min(720,iw)':-2",
            "-q:v",
            "4",
            jpg,
          ])
        : runs("sips", [
            "-s",
            "format",
            "jpeg",
            "-s",
            "formatOptions",
            "70",
            "-Z",
            "1280",
            png,
            "--out",
            jpg,
          ]);
    if (ok && existsSync(jpg)) {
      imageTool = tool;
      return true;
    }
  }
  imageTool = null;
  return false;
}

/** Saves a PNG screenshot, as a JPEG when it can; returns the file's name. */
export function saveImage(png: Buffer, base: string): string {
  const pngPath = `${base}.png`;
  writeFileSync(pngPath, png);
  const jpgPath = `${base}.jpg`;
  if (!toJpeg(pngPath, jpgPath)) return path.basename(pngPath);
  rmSync(pngPath);
  return path.basename(jpgPath);
}

/** Re-encodes a recording smaller, in place, when it can. */
export function shrinkVideo(file: string): void {
  const out = `${file}.small${path.extname(file)}`;
  const before = statSync(file).size;
  const ok =
    runs(FFMPEG, [
      "-y",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "scale=360:-2",
      "-c:v",
      path.extname(file) === ".webm" ? "libvpx" : "libx264",
      "-crf",
      "32",
      "-b:v",
      "600k",
      "-an",
      out,
    ]) ||
    (process.platform === "darwin" &&
      runs("avconvert", [
        "--source",
        file,
        "--output",
        out,
        "--preset",
        "Preset640x480",
        "--replace",
      ]));
  if (ok && existsSync(out) && statSync(out).size < before)
    renameSync(out, file);
  else rmSync(out, { force: true });
}
