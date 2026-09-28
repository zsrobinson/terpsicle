// Review summaries' JSON route, composed into src/server/api/router.ts.
import { ReviewSummaryInputSchema } from "~/core/schema";
import { route } from "../api/route";
import { getReviewSummary } from "./service";

export const SUMMARY_ROUTES = {
  "review-summary": route({
    input: ReviewSummaryInputSchema,
    perIpPerHour: 300,
    handle: (env, input, ctx) =>
      getReviewSummary(env, input, { now: ctx.now, waitUntil: ctx.waitUntil }),
  }),
} as const;
