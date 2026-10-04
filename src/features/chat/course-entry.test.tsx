import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_NOW, fixtureTermId } from "~/fixtures";
import { chatApi } from "~/server/fns/chat-api";
import { createTestQueryClient } from "~/state/query/testing";
import { TooltipProvider } from "~/ui/tooltip";
import { FLAGS_OFF, useAccount } from "../auth/account-store";
import { CourseChatEntry } from "./course-entry";
import { roomMembersQuery } from "./queries";

afterEach(() => {
  vi.restoreAllMocks();
});

function entry(courseCode: string, client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <CourseChatEntry termId={fixtureTermId} courseCode={courseCode} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const signIn = () =>
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, chat: "on" },
    user: {
      id: "tstudent",
      name: "Test Student",
      email: "tstudent@terpmail.umd.edu",
      isAdmin: false,
      createdAt: FIXTURE_NOW,
    },
  });

describe("CourseChatEntry", () => {
  it("links to the course's chat with how many people are in it", async () => {
    signIn();
    const members = vi
      .spyOn(chatApi, "members")
      .mockResolvedValue({ status: "ok", members: [], total: 42 });
    entry("CMSC351");
    const link = await screen.findByRole("link", {
      name: "Join CMSC351 chat · 42 people",
    });
    expect(link).toHaveAttribute("href", "/chat/CMSC351/everyone?join=1");
    expect(members).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
      roomId: `${fixtureTermId}:CMSC351`,
    });
  });

  it("asks once for a course's count, the same copy its room's @ list reads", async () => {
    signIn();
    const members = vi
      .spyOn(chatApi, "members")
      .mockResolvedValue({ status: "ok", members: [], total: 42 });
    const client = createTestQueryClient();
    entry("CMSC351", client).unmount();
    await vi.waitFor(() => expect(members).toHaveBeenCalledOnce());
    // Course details again (another section, or back to the course).
    entry("CMSC351", client);
    expect(
      await screen.findByRole("link", {
        name: "Join CMSC351 chat · 42 people",
      }),
    ).toBeInTheDocument();
    await client.fetchQuery(
      roomMembersQuery({
        id: `${fixtureTermId}:CMSC351`,
        termId: fixtureTermId,
        courseCode: "CMSC351",
      }),
    );
    expect(members).toHaveBeenCalledOnce();
  });

  it("leads to Chat's sign-in moment when you're signed out", () => {
    useAccount.setState({
      status: "signed-out",
      flags: { ...FLAGS_OFF, signIn: true, chat: "on" },
      user: null,
    });
    const members = vi.spyOn(chatApi, "members");
    entry("CMSC330");
    expect(
      screen.getByRole("link", { name: "Join CMSC330 chat" }),
    ).toBeInTheDocument();
    expect(members).not.toHaveBeenCalled();
  });
});
