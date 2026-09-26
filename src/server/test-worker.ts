// The worker test pool's `main` (vitest.config.ts): the Durable Object
// classes src/server.ts exports, without TanStack Start's build-time
// modules, so tests can bind COURSE_CHAT and open sockets to it.
export { CourseChat } from "./chat/course-chat";
