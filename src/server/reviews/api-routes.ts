// Terpsicle Reviews' JSON routes (V2.md §7.4), composed into
// src/server/api/router.ts. Anonymous to readers: see ./api.ts.
import {
  PlanetTerpReviewsInputSchema,
  ReviewDeleteInputSchema,
  ReviewEditInputSchema,
  ReviewListInputSchema,
  ReviewSubmitInputSchema,
  ReviewsMineInputSchema,
  ReviewsPageInputSchema,
  ReviewsRecentInputSchema,
} from "~/core/schema";
import { route } from "../api/route";
import {
  deleteReview,
  editReview,
  listReviews,
  myReviews,
  submitReview,
} from "./api";
import { listRecent, morePlanetTerpReviews, pageReviews } from "./public";

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
  "planetterp/reviews": route({
    input: PlanetTerpReviewsInputSchema,
    perIpPerHour: 1_200,
    handle: (env, input) => morePlanetTerpReviews(env, input),
  }),
  // Which courses and instructors were reviewed lately, for /reviews.
  "reviews/recent": route({
    input: ReviewsRecentInputSchema,
    perIpPerHour: 600,
    reviews: "read",
    handle: (env, input) => listRecent(env, input),
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
