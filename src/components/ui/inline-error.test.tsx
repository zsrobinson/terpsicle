import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineError } from "./inline-error";
import { TooltipProvider } from "./tooltip";

describe("InlineError", () => {
  it("says what happened in one sentence, with Try again", async () => {
    const onRetry = vi.fn();
    render(
      <TooltipProvider>
        <InlineError
          message="ELMS didn't answer. We'll try again in 20 minutes."
          onRetry={onRetry}
        />
      </TooltipProvider>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "ELMS didn't answer. We'll try again in 20 minutes.",
    );
    // Never red.
    expect(status.innerHTML).not.toMatch(/error|destructive/);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says Trying… and takes no second press while a retry is on its way", () => {
    render(
      <TooltipProvider>
        <InlineError
          message="The catalog didn't load."
          onRetry={vi.fn()}
          retrying
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Trying…" })).toBeDisabled();
  });

  it("offers Reload, with its tooltip, where only a newer version can help", async () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    const onRetry = vi.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <InlineError
          message="Terpsicle was updated. Reload to keep chatting."
          onRetry={onRetry}
          reload
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Reload" });
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Reload Terpsicle to get the new version",
    );
    await user.click(button);
    expect(reload).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it("has no Try again where retrying can't help", () => {
    render(<InlineError message="This link has expired." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
