import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "~/features/site/site-page";

// Terpsicle Chat: a stub until the chat track fills it in.
export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [{ title: "Chat · Terpsicle" }] }),
  component: ChatPage,
});

function ChatPage() {
  return (
    <ComingSoonPage title="Terpsicle Chat">
      Talk with the other students in your classes.
    </ComingSoonPage>
  );
}
