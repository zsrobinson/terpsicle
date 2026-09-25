// Worker entry (wrangler.jsonc `main`). Routing lives in src/server/worker.ts
// so it can be tested without TanStack Start's build-time modules.
import app from "@tanstack/react-start/server-entry";
import { createWorker } from "~/server/worker";

export default createWorker(app);
