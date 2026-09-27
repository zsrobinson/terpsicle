import { createFileRoute } from "@tanstack/react-router";
import { ImportView } from "~/features/four-year/import-panel";

// Plan's Import view (V3 §2.10): paste a transcript, check it, import. The
// paste stays in the page, never the URL.
export const Route = createFileRoute("/plan/import")({
  staticData: { planView: "import" },
  component: ImportView,
});
