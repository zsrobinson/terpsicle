import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ADMIN_FEEDBACK_PATH } from "~/core/routing";
import {
  FeedbackIdSchema,
  FeedbackKindSchema,
  FeedbackProductSchema,
  FeedbackStatusSchema,
} from "~/core/schema/feedback-enums";
import { AdminFrame } from "~/features/admin/admin-frame";
import { FeedbackPage } from "~/features/admin/feedback-page";

// The feedback inbox (docs/FEEDBACK.md). Filters live in the URL, so Back
// undoes one; `?item=<id>` is one item, the link issues and agents get.
export const Route = createFileRoute("/admin/feedback")({
  ssr: false,
  validateSearch: z.object({
    status: FeedbackStatusSchema.optional().catch(undefined),
    kind: FeedbackKindSchema.optional().catch(undefined),
    product: FeedbackProductSchema.optional().catch(undefined),
    host: z.string().min(1).max(200).optional().catch(undefined),
    item: FeedbackIdSchema.optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Feedback · Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFeedbackRoute,
});

function AdminFeedbackRoute() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminFrame current={ADMIN_FEEDBACK_PATH}>
      <FeedbackPage
        filters={filters}
        onFilters={(next) => void navigate({ search: next })}
      />
    </AdminFrame>
  );
}
