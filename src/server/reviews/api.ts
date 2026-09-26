// Terpsicle Reviews' JSON routes (docs/V2.md §7.4), registered in
// src/server/api/router.ts:
//
//   reviews/list     anyone: an instructor's published reviews, a page at a time
//   reviews/submit   signed in: write a review (a second for the same course edits the first)
//   reviews/edit     signed in, your own: change it; a published one stays up while it's checked
//   reviews/delete   signed in, your own
//   reviews/mine     signed in: your reviews and where each stands
//
// Anonymous to readers (§7.5): what reviews/list answers has no author, and
// author ids stay in store.ts. Every write goes through stage 0 (`precheck`)
// and then moderate().
import {
  createdMonth,
  isBurst,
  mainReason,
  REVIEW_LIMITS,
  reviewTextKey,
  stageZeroProblems,
  weeklyLimitWait,
} from "~/core/reviews";
import type {
  ModerationResult,
  MyReview,
  PublicReview,
  ReviewDeleteInput,
  ReviewDeleteResult,
  ReviewEditInput,
  ReviewListInput,
  ReviewListResult,
  ReviewRow,
  ReviewSubmitInput,
  ReviewsMineResult,
  ReviewWriteResult,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import type { AuthUser } from "../auth/session";
import { randomToken, sha256Hex } from "../crypto";
import {
  type ModerationEnv,
  moderate,
  queueForOwner,
  withdrawFromQueue,
} from "../moderation/service";
import { openReports } from "../moderation/store";
import { resolveInstructor } from "./instructors";
import {
  deleteOwnReview,
  discardUnchecked,
  getLiveReview,
  getOwnReview,
  getReview,
  hasPublishedCopy,
  insertReview,
  instructorActivity,
  listOwnReviews,
  listPublished,
  publish,
  type ReviewFields,
  recentCreatedAt,
  reject,
  rewriteHeld,
  setPendingEdit,
  setWaiting,
} from "./store";

export interface ReviewsEnv extends ModerationEnv {
  DATA: R2Bucket;
  /** off | read | on (V2 §7.4); the router checks it. */
  REVIEWS_ENABLED?: string;
}

type WriteContext = IdentityRouteContext;

// ---------- reading ----------

export function toPublicReview(row: ReviewRow): PublicReview {
  return {
    id: row.id,
    course: row.course,
    termId: row.term_id,
    rating: row.rating,
    grade: row.grade,
    body: row.body,
    // Month only, and when it was written rather than published: a held
    // review's publish time would say when the owner looked.
    createdMonth: createdMonth(row.created_at),
    edited: row.edited_at !== null,
  };
}

export async function listReviews(
  env: Pick<ReviewsEnv, "DB">,
  input: ReviewListInput,
): Promise<ReviewListResult> {
  // One extra row says whether there's another page.
  const rows = await listPublished(env.DB, {
    ...input,
    limit: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    reviews: page.map(toPublicReview),
    next: rows.length > input.limit && last ? last.id : null,
  };
}

function toMyReview(row: ReviewRow, instructorName: string): MyReview | null {
  if (row.status === "deleted") return null;
  const edit = row.pending_edit;
  return {
    id: row.id,
    instructorId: row.instructor_id,
    instructorName,
    reviewedName: row.reviewed_name,
    course: row.course,
    termId: row.term_id,
    rating: row.rating,
    grade: row.grade,
    body: row.body,
    status: row.status,
    reason: row.reason,
    pendingEdit: edit
      ? {
          termId: edit.termId,
          rating: edit.rating,
          grade: edit.grade,
          body: edit.body,
          state: edit.state,
          reason: edit.reason,
        }
      : null,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    editedAt: row.edited_at,
  };
}

export async function myReviews(
  env: Pick<ReviewsEnv, "DB">,
  ctx: WriteContext,
): Promise<ReviewsMineResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const rows = await listOwnReviews(env.DB, user.id);
  return {
    reviews: rows.flatMap(({ review, instructorName }) => {
      const mine = toMyReview(review, instructorName);
      return mine ? [mine] : [];
    }),
  };
}

// ---------- writing ----------

/** The checks every write shares, before anything is stored. */
async function precheckWrite(
  user: AuthUser,
  body: string,
  now: Date,
): Promise<
  | { ok: false; result: ReviewWriteResult }
  | { ok: true; text: string; textHash: string }
> {
  if (user.reviewsBlockedUntil && user.reviewsBlockedUntil > now.toISOString())
    return {
      ok: false,
      result: { status: "blocked", until: user.reviewsBlockedUntil },
    };
  const problems = stageZeroProblems(body);
  if (problems.length > 0)
    return { ok: false, result: { status: "invalid", problems } };
  const text = body.trim();
  return { ok: true, text, textHash: await sha256Hex(reviewTextKey(text)) };
}

const DUPLICATE: ReviewWriteResult = {
  status: "invalid",
  problems: [{ code: "duplicate" }],
};

export async function submitReview(
  env: ReviewsEnv,
  input: ReviewSubmitInput,
  ctx: WriteContext,
): Promise<ReviewWriteResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const { now } = ctx;
  const checked = await precheckWrite(user, input.body, now);
  if (!checked.ok) return checked.result;

  const instructor = await resolveInstructor(env, input, now);
  const fields: ReviewFields = {
    termId: input.termId,
    rating: input.rating,
    grade: input.grade,
    body: checked.text,
    textHash: checked.textHash,
  };
  // One live review per instructor and course: a second is an edit of it.
  const existing = await getLiveReview(
    env.DB,
    user.id,
    instructor.id,
    input.course,
  );
  if (existing) return editExisting(env, existing, fields, ctx);

  if (await hasPublishedCopy(env.DB, instructor.id, checked.textHash, null))
    return DUPLICATE;
  const wait = weeklyLimitWait(
    await recentCreatedAt(
      env.DB,
      user.id,
      new Date(now.getTime() - REVIEW_LIMITS.weekMs),
    ),
    now,
  );
  if (wait !== null) return { status: "limit", retryAfterSeconds: wait };
  const burst = isBurst(await instructorActivity(env.DB, instructor.id, now));

  const id = randomToken(16);
  const inserted = await insertReview(env.DB, {
    id,
    authorId: user.id,
    instructorId: instructor.id,
    reviewedName: input.reviewedName,
    course: input.course,
    ...fields,
    now,
  });
  if (inserted === "exists") {
    // Another request of theirs got there first.
    const raced = await getLiveReview(
      env.DB,
      user.id,
      instructor.id,
      input.course,
    );
    return raced
      ? editExisting(env, raced, fields, ctx)
      : { status: "not-found" };
  }

  let result: ModerationResult;
  try {
    result = await screen(env, id, input.course, checked.text, now);
  } catch (error) {
    // Nothing decided it (D1 failed), so nothing should wait on it or count
    // against the author's week: they can simply try again.
    await discardUnchecked(env.DB, id);
    throw error;
  }
  const review = await getReview(env.DB, id);
  if (!review) return { status: "not-found" };

  if (burst && result.decision !== "remove") {
    // Too many new reviews of this instructor today: a person looks first,
    // whatever the models said (V2 §7.4), and a retry can't publish it.
    await queueForOwner(
      env,
      {
        kind: "review",
        targetId: id,
        text: checked.text,
        course: input.course,
        reasons: [{ code: "burst", source: "system", action: "hold" }],
        urgent: false,
      },
      { now, decision: { stage: "rules", verdict: "hold" } },
    );
    // The models' own reason, if they held it, is the one the author can act on.
    const reason =
      result.decision === "hold" ? mainReason(result.reasons, "hold") : "burst";
    await setWaiting(env.DB, id, "held", reason, now);
    return { status: "held", reviewId: id, reason };
  }
  return settleNew(env, review, result, now);
}

export async function editReview(
  env: ReviewsEnv,
  input: ReviewEditInput,
  ctx: WriteContext,
): Promise<ReviewWriteResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const review = await getOwnReview(env.DB, user.id, input.reviewId);
  if (!review || review.status === "rejected") return { status: "not-found" };
  const checked = await precheckWrite(user, input.body, ctx.now);
  if (!checked.ok) return checked.result;
  return editExisting(
    env,
    review,
    {
      termId: input.termId,
      rating: input.rating,
      grade: input.grade,
      body: checked.text,
      textHash: checked.textHash,
    },
    ctx,
  );
}

/** An edit of a live review of yours, after stage 0. */
async function editExisting(
  env: ReviewsEnv,
  review: ReviewRow,
  fields: ReviewFields,
  ctx: WriteContext,
): Promise<ReviewWriteResult> {
  const { now } = ctx;
  // Reported: a person judges what readers reported before it changes, and
  // an edit that passes the models mustn't take it out of their queue.
  if (
    review.status === "hidden" ||
    (await openReports(env.DB, "review", review.id)).length > 0
  )
    return { status: "under-review" };
  if (
    await hasPublishedCopy(
      env.DB,
      review.instructor_id,
      fields.textHash,
      review.id,
    )
  )
    return DUPLICATE;

  if (review.status === "held") {
    // Nobody has seen it yet, so the new words simply replace the old.
    await rewriteHeld(env.DB, review.id, fields, now);
    const result = await screen(
      env,
      review.id,
      review.course,
      fields.body,
      now,
    );
    const updated = await getReview(env.DB, review.id);
    return updated
      ? settleNew(env, updated, result, now)
      : { status: "not-found" };
  }

  // Published: it stays up with its old words while the edit is checked.
  await setPendingEdit(
    env.DB,
    review.id,
    { ...fields, state: "waiting", reason: null },
    now,
  );
  const result = await screen(env, review.id, review.course, fields.body, now);
  const updated = await getReview(env.DB, review.id);
  const edit = updated?.pending_edit;
  // Deleted, or a newer edit replaced this one, while it was checked.
  if (!updated || edit?.body !== fields.body) return { status: "not-found" };
  switch (result.decision) {
    case "publish":
      await publish(env.DB, updated, now);
      return { status: "published", reviewId: review.id };
    case "hold": {
      const reason = mainReason(result.reasons, "hold");
      await setPendingEdit(env.DB, review.id, { ...edit, reason }, now);
      return { status: "held", reviewId: review.id, reason };
    }
    case "remove": {
      const reason = mainReason(result.reasons, "remove");
      await setPendingEdit(
        env.DB,
        review.id,
        { ...edit, state: "rejected", reason },
        now,
      );
      return { status: "rejected", reviewId: review.id, reason };
    }
  }
}

const screen = (
  env: ReviewsEnv,
  reviewId: string,
  course: ReviewRow["course"],
  text: string,
  now: Date,
) =>
  moderate(
    env,
    { kind: "review", text, context: { targetId: reviewId, course } },
    { now },
  );

/** Applies moderate()'s answer to a review readers haven't seen. */
async function settleNew(
  env: ReviewsEnv,
  review: ReviewRow,
  result: ModerationResult,
  now: Date,
): Promise<ReviewWriteResult> {
  switch (result.decision) {
    case "publish":
      await publish(env.DB, review, now);
      return { status: "published", reviewId: review.id };
    case "hold": {
      const reason = mainReason(result.reasons, "hold");
      await setWaiting(env.DB, review.id, "held", reason, now);
      return { status: "held", reviewId: review.id, reason };
    }
    case "remove": {
      const reason = mainReason(result.reasons, "remove");
      await reject(env.DB, review.id, reason, now);
      return { status: "rejected", reviewId: review.id, reason };
    }
  }
}

export async function deleteReview(
  env: Pick<ReviewsEnv, "DB">,
  input: ReviewDeleteInput,
  ctx: WriteContext,
): Promise<ReviewDeleteResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  if (!(await deleteOwnReview(env.DB, user.id, input.reviewId, ctx.now)))
    return { status: "not-found" };
  // Gone, so there's nothing left for the owner to decide.
  await withdrawFromQueue(env.DB, "review", input.reviewId);
  return { status: "deleted" };
}
