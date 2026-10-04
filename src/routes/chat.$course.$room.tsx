import { createFileRoute } from "@tanstack/react-router";
import { ChatRoomSearchSchema } from "~/core/schema";

// A room: `/chat/CMSC351/everyone`, `/chat/CMSC351/0101`,
// `/chat/CMSC351/pedram-sadeghian` (~/core/chat/room-paths), with its
// thread in `?thread=`. The layout (chat.tsx) draws it beside the list.
export const Route = createFileRoute("/chat/$course/$room")({
  validateSearch: ChatRoomSearchSchema,
  component: () => null,
});
