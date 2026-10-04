import { createFileRoute, redirect } from "@tanstack/react-router";

// `/chat/CMSC351` is the course's room for everyone: `/chat/CMSC351/everyone`.
// The paths module loads on demand: `beforeLoad` stays in the route tree
// every page carries.
export const Route = createFileRoute("/chat/$course/")({
  beforeLoad: async ({ location }) => {
    const { chatPath, parseChatPath } = await import("~/core/chat/room-paths");
    const at = parseChatPath(
      location.pathname,
      new URLSearchParams(location.searchStr),
    );
    throw redirect({ href: chatPath(at ?? {}), replace: true });
  },
  component: () => null,
});
