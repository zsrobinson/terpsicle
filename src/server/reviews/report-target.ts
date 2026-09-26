// What reports/create needs from Reviews (docs/MODERATION.md §6): find a
// review readers can see, and take it down when reports say so.
import type { ReportTarget } from "../moderation/reports";
import { countReport, getReview, hidePublished, isAuthor } from "./store";

export const reviewReportTarget: ReportTarget = {
  async find(db, ref, reporterId) {
    const review = await getReview(db, ref);
    // Readers only ever see published reviews; a hidden one may still be on
    // someone's screen, so a report on it is kept too.
    if (
      !review ||
      (review.status !== "published" && review.status !== "hidden")
    )
      return null;
    return {
      own: await isAuthor(db, ref, reporterId),
      shown: review.status === "published",
      text: review.body,
      course: review.course,
    };
  },
  counted: (db, ref, now) => countReport(db, ref, now),
  hide: (db, ref, now) => hidePublished(db, ref, now),
};
