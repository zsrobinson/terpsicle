import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatItem } from "~/core/chat";
import { aChatAuthor, aChatMessage, FIXTURE_NOW } from "~/fixtures";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import {
  type MessageActions,
  MessageRow,
  SENDING_NOTE_AFTER_MS,
} from "./message-row";

const me = aChatAuthor({ directoryId: "tstudent", name: "Test Student" });
const noor = aChatAuthor();
const NOW = Date.parse(FIXTURE_NOW);

function actions(): MessageActions & Record<string, ReturnType<typeof vi.fn>> {
  return {
    openThread: vi.fn(),
    edit: vi.fn(async () => true),
    remove: vi.fn(),
    react: vi.fn(),
    retry: vi.fn(),
    discard: vi.fn(),
    report: vi.fn(async () => "reported" as const),
  };
}

const wrap = (node: ReactNode) =>
  render(
    <TooltipProvider delayDuration={0}>
      {node}
      <Toaster />
    </TooltipProvider>,
  );

function row(item: ChatItem, a = actions(), writable = true) {
  wrap(
    <MessageRow
      item={item}
      you={me}
      now={NOW}
      showHeader
      inThread={false}
      writable={writable}
      actions={a}
    />,
  );
  return { a, user: userEvent.setup() };
}

describe("MessageRow", () => {
  it("shows what someone wrote as plain text, never HTML", () => {
    row(aChatMessage({ text: "<b>bold</b> <img src=x onerror=alert(1)>" }));
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent(
      "<b>bold</b> <img src=x onerror=alert(1)>",
    );
    expect(article.querySelector("b, img[src='x']")).toBeNull();
    expect(within(article).getByText(noor.name)).toBeInTheDocument();
  });

  it("tells only the author why classmates can't see a message yet", () => {
    row(
      aChatMessage({
        author: me,
        moderation: { state: "held", reason: "flagged" },
      }),
    );
    expect(screen.getByTestId("held-note")).toHaveTextContent(
      "Only you can see this for now, until a person looks at it.",
    );
    expect(
      screen.getByRole("article").querySelector("[data-message-body]"),
    ).toHaveClass("text-muted");
  });

  it("shows a message being checked as sent, with nothing about checking", () => {
    row(
      aChatMessage({
        author: me,
        text: "anyone at office hours?",
        moderation: { state: "held", reason: "checking" },
      }),
    );
    expect(screen.queryByTestId("held-note")).toBeNull();
    expect(screen.queryByText(/check/i)).toBeNull();
    expect(
      screen.getByRole("article").querySelector("[data-message-body]"),
    ).not.toHaveClass("text-muted");
  });

  it("says Sending… only when a send is slow", () => {
    vi.useFakeTimers();
    try {
      row({
        ...aChatMessage({
          id: "local-q2",
          author: me,
          moderation: { state: "held", reason: "checking" },
        }),
        local: { req: "q2", state: "sending" },
      });
      expect(screen.queryByText("Sending…")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(SENDING_NOTE_AFTER_MS);
      });
      expect(screen.getByText("Sending…")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a refused send again, in words and not in red", async () => {
    const { a, user } = row({
      ...aChatMessage({
        id: "local-q1",
        author: me,
        moderation: { state: "held", reason: "checking" },
      }),
      local: { req: "q1", state: "failed", error: "slow-down" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're sending fast. Try again in a moment.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(a.retry).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(a.discard).toHaveBeenCalled();
  });

  it("toggles your reaction, and says who reacted", async () => {
    const { a, user } = row(
      aChatMessage({
        reactions: { thumbs: ["tstudent", "noorh"], eyes: ["noorh"] },
      }),
    );
    const thumbs = screen.getByRole("button", {
      name: "Thumbs up: You and 1 other",
    });
    expect(thumbs).toHaveAttribute("aria-pressed", "true");
    await user.click(thumbs);
    expect(a.react).toHaveBeenCalledWith(expect.anything(), "thumbs", false);
    await user.click(screen.getByRole("button", { name: "Looking: 1 person" }));
    expect(a.react).toHaveBeenCalledWith(expect.anything(), "eyes", true);
  });

  it("opens a thread from its summary", async () => {
    const { a, user } = row(
      aChatMessage({ thread: { count: 3, lastAt: FIXTURE_NOW } }),
    );
    await user.click(screen.getByRole("button", { name: /^3 replies · last/ }));
    expect(a.openThread).toHaveBeenCalled();
  });

  it("reports someone else's message inline, with a reason", async () => {
    const { a, user } = row(aChatMessage());
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Report" }));
    const form = screen.getByRole("form", { name: "Report this message" });
    expect(
      within(form).getByRole("button", { name: "Send report" }),
    ).toBeDisabled();
    await user.click(within(form).getByRole("radio", { name: "A threat" }));
    await user.type(within(form).getByRole("textbox"), "  after class  ");
    await user.click(within(form).getByRole("button", { name: "Send report" }));
    expect(a.report).toHaveBeenCalledWith(
      expect.anything(),
      "threat",
      "after class",
    );
    expect(
      await screen.findByText("Thanks. A person will look at it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("offers only abuse reasons, and asks what's wrong for Something else", async () => {
    const { a, user } = row(aChatMessage());
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Report" }));
    const form = screen.getByRole("form", { name: "Report this message" });
    expect(
      within(form)
        .getAllByRole("radio")
        .map((r) => r.closest("li")?.textContent),
    ).toEqual([
      "Harassment or hate",
      "A threat",
      "Sexual content",
      "Spam",
      "Someone's private info",
      "Something else",
    ]);
    await user.click(
      within(form).getByRole("radio", { name: "Something else" }),
    );
    const send = within(form).getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    await user.type(
      within(form).getByRole("textbox", {
        name: "Say what's wrong, so a person knows what to look for",
      }),
      "keeps messaging me",
    );
    await user.click(send);
    expect(a.report).toHaveBeenCalledWith(
      expect.anything(),
      "other",
      "keeps messaging me",
    );
  });

  it("edits and deletes your own message, and never offers to report it", async () => {
    const { a, user } = row(aChatMessage({ author: me, text: "see you at 6" }));
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("menuitem", { name: "Report" })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Edit your message" });
    await user.clear(field);
    await user.type(field, "see you at 7{Enter}");
    expect(a.edit).toHaveBeenCalledWith(expect.anything(), "see you at 7");

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(a.remove).toHaveBeenCalled();
  });

  it("leaves out reacting and replying where you can't write", () => {
    row(aChatMessage(), actions(), false);
    expect(screen.queryByRole("button", { name: "React" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reply in a thread" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});
