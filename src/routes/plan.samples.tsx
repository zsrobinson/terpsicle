import { createFileRoute } from "@tanstack/react-router";
import { ChunkLoadError } from "~/app/panel-load-boundary";
import {
  SamplesFailed,
  SamplesView,
} from "~/features/four-year/template-panel";

// Plan's Samples view (V3 §2.11): sample plans to start from, in the
// sidebar, in their own chunk. The loader brings the sample plans, so the
// rail's preload on intent fetches them too. They don't change while the
// page is open, so they stay loaded; Try again invalidates them. The loader
// stays in the route tree every page carries, so it imports them lazily, and
// loading is the router's default (a pending component isn't split out).
export const Route = createFileRoute("/plan/samples")({
  staticData: { planView: "templates" },
  loader: () =>
    import("~/features/four-year/template-files").then((m) => {
      // Vite's loader resolves a failed chunk to nothing once
      // load-recovery has taken the error.
      if (!m) throw new ChunkLoadError(new Error("empty module"));
      return m.loadTemplates();
    }),
  staleTime: Number.POSITIVE_INFINITY,
  errorComponent: SamplesFailed,
  component: Samples,
});

function Samples() {
  return <SamplesView templates={Route.useLoaderData()} />;
}
