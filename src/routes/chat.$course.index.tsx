import { createFileRoute, redirect } from "@tanstack/react-router";
import { chatPath, parseChatPath } from "~/core/chat/room-paths";

// `/chat/CMSC351` is the course's room for everyone: `/chat/CMSC351/everyone`.
export const Route = createFileRoute("/chat/$course/")({
  beforeLoad: ({ location }) => {
    const at = parseChatPath(
      location.pathname,
      new URLSearchParams(location.searchStr),
    );
    throw redirect({ href: chatPath(at ?? {}), replace: true });
  },
  component: () => null,
});
