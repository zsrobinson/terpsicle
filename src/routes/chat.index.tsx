import { createFileRoute, redirect } from "@tanstack/react-router";

// The chat list (the layout, chat.tsx, draws it). An older link named its
// room in search params (`/chat?term=…&course=…&room=…&thread=…`): it goes
// to the room's path, keeping its term so a term that isn't Chat's opens
// the list. `beforeLoad` isn't split out of the route tree, so the paths
// module loads only when there's a link to read.
export const Route = createFileRoute("/chat/")({
  beforeLoad: async ({ location }) => {
    if (!location.searchStr) return;
    const { chatPath, parseChatPath } = await import("~/core/chat/room-paths");
    const at = parseChatPath(
      location.pathname,
      new URLSearchParams(location.searchStr),
    );
    if (at?.course) throw redirect({ href: chatPath(at), replace: true });
  },
  component: () => null,
});
