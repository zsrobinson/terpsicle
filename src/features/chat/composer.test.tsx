import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { Composer } from "./composer";

const MEMBERS = [
  { directoryId: "hlee", name: "Hannah Lee" },
  { directoryId: "hkim", name: "Hannah Kim" },
  { directoryId: "oali", name: "Omar Ali" },
];

function composer(
  disabledReason: string | null = null,
  loadMembers?: () => Promise<typeof MEMBERS>,
) {
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
        {...(loadMembers ? { loadMembers } : {})}
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

  describe("@-mentions", () => {
    it("offers the room's members after an @, and writes the full name", async () => {
      const load = vi.fn(async () => MEMBERS);
      const { onSend, user } = composer(null, load);
      const field = screen.getByRole("textbox");
      await user.type(field, "hi ");
      expect(load).not.toHaveBeenCalled();
      await user.type(field, "@han");
      const list = await screen.findByRole("listbox", {
        name: "Mention someone in this room",
      });
      expect(load).toHaveBeenCalledOnce();
      const options = screen.getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "Hannah Lee",
        "Hannah Kim",
      ]);
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(field).toHaveAttribute("aria-activedescendant", options[0]?.id);
      // Enter picks rather than sends.
      await user.keyboard("{ArrowDown}{Enter}");
      expect(onSend).not.toHaveBeenCalled();
      expect(list).not.toBeInTheDocument();
      expect(field).toHaveValue("hi @Hannah Kim ");
      await user.type(field, "see you there{Enter}");
      expect(onSend).toHaveBeenCalledWith("hi @Hannah Kim see you there");
    });

    it("picks with a click, and closes on Esc until the next @", async () => {
      const { user } = composer(null, async () => MEMBERS);
      const field = screen.getByRole("textbox");
      await user.type(field, "@o");
      await user.click(await screen.findByRole("option", { name: "Omar Ali" }));
      expect(field).toHaveValue("@Omar Ali ");
      await user.type(field, "and @h");
      await screen.findByRole("listbox");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).toBeNull();
      await user.type(field, " @h");
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
    });

    it("stays out of the way with no match, or without members", async () => {
      const { onSend, user } = composer(null, async () => MEMBERS);
      const field = screen.getByRole("textbox");
      await user.type(field, "@zed");
      expect(screen.queryByRole("listbox")).toBeNull();
      await user.keyboard("{Enter}");
      expect(onSend).toHaveBeenCalledWith("@zed");
    });
  });
});
