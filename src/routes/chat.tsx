import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { type ChatLocation, chatPath } from "~/core/chat/room-paths";
import { ChatRoomSearchSchema, CourseCodeSchema } from "~/core/schema";
import { ChatPage } from "~/features/chat/chat-page";
import { type ChatGo, targetLocation } from "~/features/chat/nav";
import { initAnalytics } from "~/lib/analytics";

// Terpsicle Chat (V2.md §8.6). The list is `/chat` (chat.index.tsx) and a
// room is `/chat/<COURSE>/<room>` (chat.$course.$room.tsx), with its thread
// in `?thread=` (~/core/chat/room-paths). This layout holds the one page
// both show, so opening a room keeps the list, its scroll and its socket.
// Everything talks to the Worker from the browser (the socket, chat/*,
// sync/pull), so it renders only there.
export const Route = createFileRoute("/chat")({
  ssr: false,
  head: () => ({ meta: [{ title: "Chat · Terpsicle" }] }),
  component: ChatRoute,
});

function ChatRoute() {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  useEffect(() => {
    void initAnalytics();
  }, []);
  const course = CourseCodeSchema.safeParse(params.course);
  const room = params.room;
  const query = ChatRoomSearchSchema.parse(search);
  const view = useMemo<ChatLocation>(
    () =>
      course.success
        ? {
            course: course.data,
            ...(room ? { room } : {}),
            ...(query.thread ? { thread: query.thread } : {}),
            ...(query.join ? { join: query.join } : {}),
            ...(query.term ? { term: query.term } : {}),
          }
        : {},
    [course.success, course.data, room, query.thread, query.join, query.term],
  );
  const go: ChatGo = useCallback(
    (next, options) =>
      void navigate({
        href: chatPath(targetLocation(next)),
        replace: options?.replace ?? false,
      }),
    [navigate],
  );
  return (
    <>
      <ChatPage view={view} go={go} />
      <Outlet />
    </>
  );
}
