import { DAYS, type Day } from "../schema";
import { dayIndex } from "./format";

// Busy time as bitmasks of 5-minute slots (RESEARCH §2's generator recipe),
// shared by "Fits my plan" (core/fit) and the generator (M5).
//
// A mask covers the whole day (288 slots = 9 words) for all seven days, so a
// clash check is at most 63 ANDs with no range bookkeeping. Times that aren't
// on a 5-minute boundary are widened outward, so masks are a superset of the
// real busy time: "no shared bit" proves there's no overlap, and a shared bit
// means "check the exact times" (dates included). Nearly all UMD times are on
// 5-minute boundaries, so the exact check rarely runs.

export const SLOT_MINUTES = 5;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
export const WORDS_PER_DAY = Math.ceil(SLOTS_PER_DAY / 32);
const WORDS = WORDS_PER_DAY * DAYS.length;

/** Seven days of 5-minute slots, Monday first. */
export type WeekMask = Uint32Array;

export function emptyWeekMask(): WeekMask {
  return new Uint32Array(WORDS);
}

/** Marks `[start, end)` on `day` busy. Mutates `mask`; use while building one. */
export function markBusy(
  mask: WeekMask,
  day: Day,
  start: number,
  end: number,
): void {
  const first = Math.max(0, Math.floor(start / SLOT_MINUTES));
  const last = Math.min(SLOTS_PER_DAY, Math.ceil(end / SLOT_MINUTES));
  const base = dayIndex(day) * WORDS_PER_DAY;
  for (let slot = first; slot < last; ) {
    const word = slot >>> 5;
    const bit = slot & 31;
    const run = Math.min(32 - bit, last - slot);
    // A run of `run` ones starting at `bit`; `>>> 0` keeps it unsigned when run = 32.
    const bits = run === 32 ? 0xffffffff : ((1 << run) - 1) << bit;
    const i = base + word;
    mask[i] = ((mask[i] ?? 0) | bits) >>> 0;
    slot += run;
  }
}

export function weekMaskOf(
  items: Iterable<{ day: Day; start: number; end: number }>,
): WeekMask {
  const mask = emptyWeekMask();
  for (const item of items) markBusy(mask, item.day, item.start, item.end);
  return mask;
}

export function masksIntersect(a: WeekMask, b: WeekMask): boolean {
  for (let i = 0; i < WORDS; i++) {
    if (((a[i] ?? 0) & (b[i] ?? 0)) !== 0) return true;
  }
  return false;
}

/** A new mask busy wherever any input is. */
export function unionMasks(masks: Iterable<WeekMask>): WeekMask {
  const out = emptyWeekMask();
  for (const m of masks) {
    for (let i = 0; i < WORDS; i++)
      out[i] = ((out[i] ?? 0) | (m[i] ?? 0)) >>> 0;
  }
  return out;
}

export function isMaskEmpty(mask: WeekMask): boolean {
  for (let i = 0; i < WORDS; i++) if ((mask[i] ?? 0) !== 0) return false;
  return true;
}
