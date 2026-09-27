import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineError } from "./inline-error";

describe("InlineError", () => {
  it("says what happened in one sentence, with Try again", async () => {
    const onRetry = vi.fn();
    render(
      <InlineError
        message="ELMS didn't answer. We'll try again in 20 minutes."
        onRetry={onRetry}
      />,
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

  it("has no Try again where retrying can't help", () => {
    render(<InlineError message="This link has expired." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
