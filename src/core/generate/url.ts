import {
  type Day,
  DEFAULT_RANK_BY,
  type GenerateDraft,
  RankFactorSchema,
} from "../schema";
import { type GenerateTabSearch, listItems } from "../schema/schedule-url";
import { sortDays } from "../time/format";
import {
  NO_PREFERENCES,
  type PreferenceLevel,
  preferenceLevels,
  rankByFromLevels,
} from "./preferences";
import { RANK_FACTORS } from "./score";

// Generate's filter and preference chips in its URL
// (`/schedule/generate?prefer=later-starts,best-rated*2&off=F`), so a
// reload, a copied link and Back keep them. Each param is absent at its
// default, so a plain link opens the form as it was left.

/** The chips: what filters the results and what ranks them. */
export type GenerateChips = Pick<GenerateDraft, "mustHaves" | "rankBy">;

export type ChipParams = Omit<GenerateTabSearch, "view">;

/** `later-starts,best-rated*2`, `none`, or absent at the default. */
function preferParam(chips: GenerateChips): string | undefined {
  const levels = preferenceLevels(chips.rankBy);
  const base = preferenceLevels(DEFAULT_RANK_BY);
  if (RANK_FACTORS.every((f) => levels[f] === base[f])) return undefined;
  const on = RANK_FACTORS.flatMap((f) =>
    levels[f] === 0 ? [] : [levels[f] === 2 ? `${f}*2` : f],
  );
  return on.length > 0 ? on.join(",") : "none";
}

/** The params for a set of chips. */
export function chipParams(chips: GenerateChips): ChipParams {
  const m = chips.mustHaves;
  return {
    prefer: preferParam(chips),
    start: m.earliestStart ?? undefined,
    end: m.latestEnd ?? undefined,
    off: m.daysOff.length > 0 ? sortDays(m.daysOff).join(",") : undefined,
    seats: m.openSeatsOnly ? 1 : undefined,
    walk: m.enoughTravelTime ? undefined : 0,
    blocks: m.respectBlocks ? undefined : 0,
    minCredits: m.credits.min ?? undefined,
    maxCredits: m.credits.max ?? undefined,
  };
}

/** The chips validated params ask for; a missing param is its default. */
export function chipsFromParams(params: ChipParams): GenerateChips {
  let rankBy = DEFAULT_RANK_BY;
  if (params.prefer !== undefined) {
    const levels: Record<string, PreferenceLevel> = { ...NO_PREFERENCES };
    for (const item of listItems(params.prefer)) {
      const factor = RankFactorSchema.safeParse(item.replace("*2", ""));
      if (factor.success) levels[factor.data] = item.endsWith("*2") ? 2 : 1;
    }
    rankBy = rankByFromLevels({ ...NO_PREFERENCES, ...levels });
  }
  return {
    rankBy,
    mustHaves: {
      earliestStart: params.start ?? null,
      latestEnd: params.end ?? null,
      // The schema checked each day.
      daysOff: sortDays(listItems(params.off) as Day[]),
      enoughTravelTime: params.walk !== 0,
      openSeatsOnly: params.seats === 1,
      respectBlocks: params.blocks !== 0,
      credits: {
        min: params.minCredits ?? null,
        max: params.maxCredits ?? null,
      },
    },
  };
}

/** Two sets of chips ask for the same plans in the same order. */
export function sameChips(a: GenerateChips, b: GenerateChips): boolean {
  return JSON.stringify(chipParams(a)) === JSON.stringify(chipParams(b));
}
