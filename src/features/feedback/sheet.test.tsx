import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeUser } from "~/core/schema";
import type { FeedbackSendInput } from "~/core/schema/feedback";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { ApiCallError } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { useDraft } from "./draft-store";
import { usePins } from "./pin-store";
import type { Shot } from "./screenshot";
import { FeedbackForm } from "./sheet";

const api = vi.hoisted(() => ({
  send: vi.fn(),
  undo: vi.fn(),
  pin: vi.fn(),
  pins: vi.fn(),
}));
vi.mock("~/server/fns/feedback-api", () => ({ feedbackApi: api }));

// Canvas and modern-screenshot don't run in happy-dom: a stand-in shot.
vi.mock("./screenshot", async (original) => {
  const real = await original<typeof import("./screenshot")>();
  const shot = (): Shot => ({
    source: document.createElement("canvas"),
    blob: new Blob(["x"], { type: "image/webp" }),
    type: "image/webp",
    width: 10,
    height: 10,
    url: "blob:shot",
    edited: false,
    fromFile: false,
  });
  return {
    ...real,
    takeScreenshot: vi.fn(async () => shot()),
    base64Of: vi.fn(async () => "UklGRg=="),
    releaseShot: vi.fn(),
  };
});

const STUDENT: MeUser = {
  id: "tstudent",
  name: "Test Student",
  email: "tstudent@terpmail.umd.edu",
  avatarUrl: null,
  isAdmin: false,
  createdAt: "2026-09-01T15:00:00.000Z",
};
const ADMIN: MeUser = { ...STUDENT, id: "tadmin", isAdmin: true };

function signedInAs(user: MeUser | null) {
  useAccount.setState({
    status: user ? "signed-in" : "signed-out",
    flags: { ...FLAGS_OFF, signIn: true },
    user,
    deleteAfter: null,
  });
}

const wrap = (node: ReactNode) =>
  render(
    <TooltipProvider delayDuration={0}>
      {node}
      <Toaster />
    </TooltipProvider>,
  );

function renderForm() {
  const onSent = vi.fn();
  const onStartPin = vi.fn();
  wrap(
    <FeedbackForm product="schedule" onSent={onSent} onStartPin={onStartPin} />,
  );
  return { onSent, onStartPin, user: userEvent.setup() };
}

const sent = () => api.send.mock.calls[0]?.[0] as FeedbackSendInput;

beforeEach(() => {
  signedInAs(null);
  useDraft.getState().clear();
  useDraft.setState({ mode: "bug" });
  api.send.mockResolvedValue({
    id: "AAAAAAAAAAAAAAAAAAAAAA",
    undoToken: "B".repeat(43),
  });
  api.undo.mockResolvedValue({ status: "undone" });
  api.pins.mockResolvedValue({ pins: [] });
});

afterEach(() => vi.clearAllMocks());

describe("the feedback sheet", () => {
  it("asks a bug what happened and what was expected", async () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "Report a bug" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("What happened?")).toBeInTheDocument();
    expect(screen.getByLabelText(/What did you expect\?/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Pin a note" })).toBeNull();
  });

  it("asks an idea what would help", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("radio", { name: "Suggest a feature" }));
    expect(screen.getByLabelText("What would help?")).toBeInTheDocument();
    expect(screen.queryByLabelText(/What did you expect\?/)).toBeNull();
  });

  it("says quietly what's lost when a box is turned off", async () => {
    const { user } = renderForm();
    await user.click(screen.getByTestId("feedback-context"));
    expect(
      screen.getByText("Without this, bugs are harder for us to track down."),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("feedback-screenshot"));
    expect(
      screen.getByText(
        "Without a screenshot, it's harder to see what you saw.",
      ),
    ).toBeInTheDocument();
  });

  it("sends a bug with the screenshot and context, then offers Undo", async () => {
    const { user, onSent } = renderForm();
    await screen.findByTestId("feedback-shot");
    await user.type(
      screen.getByLabelText("What happened?"),
      "The map is blank",
    );
    await user.type(screen.getByLabelText(/What did you expect\?/), "A route");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sent()).toMatchObject({
      kind: "bug",
      product: "schedule",
      text: "The map is blank",
      expected: "A route",
      screenshot: { type: "image/webp", data: "UklGRg==" },
      reply: false,
    });
    expect(sent().context?.version).toBe("dev");
    expect(
      await screen.findByText("Sent. Thanks for telling us."),
    ).toBeInTheDocument();
    // The draft is empty for next time.
    expect(useDraft.getState().text).toBe("");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(api.undo).toHaveBeenCalledWith({
        id: "AAAAAAAAAAAAAAAAAAAAAA",
        undoToken: "B".repeat(43),
      }),
    );
    // The words come back to fix and send again.
    await waitFor(() =>
      expect(useDraft.getState().text).toBe("The map is blank"),
    );
  });

  it("sends only what's checked", async () => {
    const { user, onSent } = renderForm();
    await user.click(screen.getByRole("radio", { name: "Suggest a feature" }));
    await user.click(screen.getByTestId("feedback-context"));
    await user.click(screen.getByTestId("feedback-screenshot"));
    await user.type(screen.getByLabelText("What would help?"), "Dark map");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty("screenshot");
    expect(sent()).not.toHaveProperty("context");
    expect(sent()).not.toHaveProperty("expected");
    expect(sent().kind).toBe("idea");
  });

  it("offers a reply only when signed in, off by default", async () => {
    signedInAs(STUDENT);
    const { user, onSent } = renderForm();
    const reply = screen.getByTestId("feedback-reply");
    expect(reply).not.toBeChecked();
    await user.click(reply);
    await user.type(screen.getByLabelText("What happened?"), "Broke");
    await user.click(screen.getByTestId("feedback-screenshot"));
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sent().reply).toBe(true);
  });

  it("says so when someone has sent a lot", async () => {
    api.send.mockRejectedValue(new ApiCallError("rate-limited", 60));
    const { user, onSent } = renderForm();
    await user.click(screen.getByTestId("feedback-screenshot"));
    await user.type(screen.getByLabelText("What happened?"), "Again");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "You've sent a lot of feedback in the last hour. Try again later.",
      ),
    ).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
    // The words stay.
    expect(screen.getByLabelText("What happened?")).toHaveValue("Again");
  });

  it("gives admins Pin a note", async () => {
    signedInAs(ADMIN);
    const { user, onStartPin } = renderForm();
    await user.click(screen.getByRole("radio", { name: "Pin a note" }));
    await user.click(screen.getByTestId("feedback-show-pins"));
    expect(usePins.getState().visible).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Pick something to pin" }),
    );
    expect(onStartPin).toHaveBeenCalled();
    usePins.getState().setVisible(true);
  });

  it("keeps the words when it's closed and opened again", async () => {
    const first = renderForm();
    await first.user.type(screen.getByLabelText("What happened?"), "Half");
    cleanup();
    renderForm();
    expect(screen.getByLabelText("What happened?")).toHaveValue("Half");
  });
});
