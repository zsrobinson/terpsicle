// Terpsicle Reviews' JSON routes (V2.md §7.4), composed into
// src/server/api/router.ts. Anonymous to readers: see ./api.ts.
import {
  PlanetTerpReviewsInputSchema,
  PlanetTerpTotalsInputSchema,
  ReviewDeleteInputSchema,
  ReviewEditInputSchema,
  ReviewListInputSchema,
  ReviewSubmitInputSchema,
  ReviewsLatestInputSchema,
  ReviewsMineInputSchema,
  ReviewsPageInputSchema,
} from "~/core/schema";
import { route } from "../api/route";
import { r2PublishedFiles } from "../pages/context";
import {
  deleteReview,
  editReview,
  listReviews,
  myReviews,
  submitReview,
} from "./api";
import { latestReviews, morePlanetTerpReviews, pageReviews } from "./public";
import { planetTerpStats } from "./stats";

export const REVIEWS_ROUTES = {
  "reviews/list": route({
    input: ReviewListInputSchema,
    perIpPerHour: 1_200,
    reviews: "read",
    handle: (env, input) => listReviews(env, input),
  }),
  // A Reviews page's first reviews, ours and PlanetTerp's (V2.md §7.6).
  // PlanetTerp's show whatever REVIEWS_ENABLED says; ours only when it
  // lets anyone read them, so there's no `reviews` gate here.
  "reviews/page": route({
    input: ReviewsPageInputSchema,
    perIpPerHour: 1_200,
    handle: (env, input) => pageReviews(env, input),
  }),
  // What PlanetTerp's data holds in all, for /reviews' counts.
  "planetterp/totals": route({
    input: PlanetTerpTotalsInputSchema,
    perIpPerHour: 600,
    handle: async (env) => ({
      totals: await planetTerpStats(r2PublishedFiles(env.DATA)),
    }),
  }),
  // The newest reviews anywhere, ours and PlanetTerp's, for /reviews.
  "reviews/latest": route({
    input: ReviewsLatestInputSchema,
    perIpPerHour: 600,
    handle: (env, input) => latestReviews(env, input),
  }),
  "planetterp/reviews": route({
    input: PlanetTerpReviewsInputSchema,
    perIpPerHour: 1_200,
    handle: (env, input) => morePlanetTerpReviews(env, input),
  }),
  "reviews/submit": route({
    input: ReviewSubmitInputSchema,
    // Each one costs two model calls; ten new reviews a week is the real limit.
    perUserPerHour: 20,
    auth: "user",
    reviews: "on",
    handle: (env, input, ctx) => submitReview(env, input, ctx),
  }),
  "reviews/edit": route({
    input: ReviewEditInputSchema,
    perUserPerHour: 30,
    auth: "user",
    reviews: "on",
    handle: (env, input, ctx) => editReview(env, input, ctx),
  }),
  "reviews/delete": route({
    input: ReviewDeleteInputSchema,
    perUserPerHour: 60,
    auth: "user",
    // Taking your own words down works even while writing is off.
    reviews: "read",
    handle: (env, input, ctx) => deleteReview(env, input, ctx),
  }),
  "reviews/mine": route({
    input: ReviewsMineInputSchema,
    perUserPerHour: 300,
    auth: "user",
    reviews: "read",
    handle: (env, _input, ctx) => myReviews(env, ctx),
  }),
} as const;
