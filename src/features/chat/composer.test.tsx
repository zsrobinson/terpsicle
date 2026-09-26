import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { Composer } from "./composer";

function composer(disabledReason: string | null = null) {
  const onSend = vi.fn();
  const onTyping = vi.fn();
  render(
    <TooltipProvider delayDuration={0}>
      <Composer
        label="Message CMSC351 · everyone"
        placeholder="Message CMSC351 · everyone"
        disabledReason={disabledReason}
        onSend={onSend}
        onTyping={onTyping}
      />
    </TooltipProvider>,
  );
  return { onSend, onTyping, user: userEvent.setup() };
}

describe("Composer", () => {
  it("sends on Enter, keeps Shift+Enter for a new line, and says you're typing", async () => {
    const { onSend, onTyping, user } = composer();
    const field = screen.getByRole("textbox", {
      name: "Message CMSC351 · everyone",
    });
    await user.type(field, "quiz on{Shift>}{Enter}{/Shift}friday?");
    expect(onTyping).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("quiz on\nfriday?");
    expect(field).toHaveValue("");
  });

  it("won't send nothing", async () => {
    const { onSend, user } = composer();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("says quietly, before you send, what a person may check first", async () => {
    const { user } = composer();
    await user.type(
      screen.getByRole("textbox"),
      "here are the answers to hw 3",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Might share answers to graded work. A person may check it before classmates see it.",
    );
  });

  it("shows why you can't write, instead of a field", () => {
    composer(
      "This room is read-only now. You can still read everything in it.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/read-only now/)).toBeInTheDocument();
  });
});
