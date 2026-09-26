// Worker entry (wrangler.jsonc `main`). Routing lives in src/server/worker.ts
// so it can be tested without TanStack Start's build-time modules.

import { PRECACHE } from "virtual:terpsicle/precache";
import app from "@tanstack/react-start/server-entry";
import { createWorker } from "~/server/worker";

export default createWorker(app, { precache: PRECACHE });
// Chat's Durable Object class (wrangler.jsonc `durable_objects`).
export { CourseChat } from "~/server/chat/course-chat";
