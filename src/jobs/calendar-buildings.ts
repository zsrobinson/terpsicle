import { runBuildings } from "~/ingest/buildings";
import { runCalendar } from "~/ingest/calendar";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/** The provost academic calendar, and the building join for new codes (weekly). */
export const runCalendarBuildingsJob: Job = async (context) => {
  await runJob("calendar-buildings", context, async () => {
    const http = jobHttp(context);
    const store = createR2BlobStore(context.env.DATA);
    const common = { http, store, now: context.now, log: jobLog };
    const errors: string[] = [];
    // Independent halves: one failing mustn't stop the other.
    const calendar = await runCalendar(common).catch((error: unknown) => {
      errors.push(
        `calendar: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    const buildings = await runBuildings(common).catch((error: unknown) => {
      errors.push(
        `buildings: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    if (!calendar && !buildings) throw new Error(errors.join("; "));
    errors.push(...(calendar?.errors ?? []));
    return {
      counts: {
        calendarsPublished: calendar?.published ?? 0,
        calendarsNotPublished: calendar?.notPublished ?? 0,
        buildings: buildings?.buildings ?? 0,
        newCodesLookedUp: buildings?.looked ?? 0,
        newCodesJoined: buildings?.joined ?? 0,
        // Codes seen in the catalog that don't join to UMD's map (reported, not errors).
        unjoinedCodes: buildings?.unjoined.length ?? 0,
      },
      errors,
    };
  });
};
