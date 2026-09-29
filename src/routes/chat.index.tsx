import { createFileRoute, redirect } from "@tanstack/react-router";
import { chatPath, parseChatPath } from "~/core/chat/room-paths";

// The chat list (the layout, chat.tsx, draws it). An older link named its
// room in search params (`/chat?term=…&course=…&room=…&thread=…`): it goes
// to the room's path, keeping its term so a term that isn't Chat's opens
// the list.
export const Route = createFileRoute("/chat/")({
  beforeLoad: ({ location }) => {
    const at = parseChatPath(
      location.pathname,
      new URLSearchParams(location.searchStr),
    );
    if (at?.course) throw redirect({ href: chatPath(at), replace: true });
  },
  component: () => null,
});
