import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ADMIN_DECISIONS_PATH } from "~/core/routing";
import {
  DecisionStageSchema,
  ModerationKindSchema,
  StoredVerdictSchema,
} from "~/core/schema";
import { AdminFrame } from "~/features/admin/admin-frame";
import { DecisionsPage } from "~/features/admin/decisions-page";

// The decision log (V2 §10). Filters live in the URL, so Back undoes one.
export const Route = createFileRoute("/admin/decisions")({
  ssr: false,
  validateSearch: z.object({
    surface: ModerationKindSchema.optional().catch(undefined),
    stage: DecisionStageSchema.optional().catch(undefined),
    verdict: StoredVerdictSchema.optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Decisions · Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDecisionsRoute,
});

function AdminDecisionsRoute() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminFrame current={ADMIN_DECISIONS_PATH}>
      <DecisionsPage
        filters={filters}
        onFilters={(next) => void navigate({ search: next })}
      />
    </AdminFrame>
  );
}
