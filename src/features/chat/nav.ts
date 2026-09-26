import type { ChatView } from "~/core/schema";

// Moving around Chat: its views are /chat's search params (ChatSearchSchema
// in ~/core/schema), and the route hands the page a way to change them.

export type { ChatView };

export type ChatGo = (next: ChatView, options?: { replace?: boolean }) => void;
