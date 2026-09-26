import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { initAnalytics } from "~/app/analytics";
import { ChatSearchSchema } from "~/core/schema";
import { ChatPage } from "~/features/chat/chat-page";
import type { ChatGo } from "~/features/chat/nav";

// Terpsicle Chat (V2.md §8.6). Everything talks to the Worker from the
// browser (the socket, chat/*, sync/pull), so it renders only there.
export const Route = createFileRoute("/chat/")({
  ssr: false,
  validateSearch: ChatSearchSchema,
  head: () => ({ meta: [{ title: "Chat · Terpsicle" }] }),
  component: ChatRoute,
});

function ChatRoute() {
  const view = Route.useSearch();
  const navigate = useNavigate({ from: "/chat/" });
  useEffect(() => {
    void initAnalytics();
  }, []);
  const go: ChatGo = useCallback(
    (next, options) =>
      void navigate({ search: next, replace: options?.replace ?? false }),
    [navigate],
  );
  return <ChatPage view={view} go={go} />;
}
