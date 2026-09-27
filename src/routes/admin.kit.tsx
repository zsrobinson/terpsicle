import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ADMIN_KIT_PATH } from "~/core/routing";
import { KitViewSchema } from "~/core/schema/admin-kit";
import { AdminFrame } from "~/features/admin/admin-frame";
import { KitPage } from "~/features/admin/kit-page";

// The page kit, every piece in every state, for reviewing it side by side in
// both themes (docs/COHESION.md §3, Phase 2). Admins only, like the rest of
// /admin (src/server/auth/pages.ts). `?view=` picks a part of the kit, and is
// the kit's own ViewSwitch working on a real URL.
export const Route = createFileRoute("/admin/kit")({
  ssr: false,
  // Admin draws its own frame: no family bar while it loads.
  staticData: { pending: "none" },
  validateSearch: z.object({
    view: KitViewSchema.optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Kit · Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminKitRoute,
});

function AdminKitRoute() {
  const { view } = Route.useSearch();
  return (
    <AdminFrame current={ADMIN_KIT_PATH} width="app">
      <KitPage view={view ?? "all"} />
    </AdminFrame>
  );
}
