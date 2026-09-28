import { createFileRoute } from "@tanstack/react-router";
import { AdminFrame } from "~/features/admin/admin-frame";
import { GradesPage } from "~/features/admin/grades-page";

// Grade data (V2 §10): the semesters whose grades to ask the university
// for, and the words to ask with. Admins only, like the rest of /admin
// (src/server/auth/pages.ts).
export const Route = createFileRoute("/admin/grades")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Grade data · Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGradesRoute,
});

function AdminGradesRoute() {
  return (
    <AdminFrame>
      <GradesPage />
    </AdminFrame>
  );
}
