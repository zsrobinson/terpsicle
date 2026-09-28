import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetStores } from "~/state/testing";
import { useWorkspace } from "~/state/workspace-store";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { UndoToasts } from "./undo-toasts";

let leave: () => void = () => {};

/** The page: the toaster stays; the scheduler (its toasts) can go. */
function Page() {
  const [scheduler, setScheduler] = useState(true);
  leave = () => setScheduler(false);
  return (
    <TooltipProvider>
      {scheduler ? <UndoToasts /> : null}
      <Toaster />
    </TooltipProvider>
  );
}

describe("UndoToasts", () => {
  beforeEach(() => resetStores());

  it("takes its toast along when the scheduler goes (Undo elsewhere would change unsaved plans)", async () => {
    render(<Page />);
    act(() =>
      useWorkspace.getState().dispatch(
        {
          type: "plan/create",
          id: "planAAAA",
          termId: "202701",
          now: "2026-09-25T12:00:00.000Z",
        },
        "Created an empty plan",
      ),
    );
    expect(
      await screen.findByText("Created an empty plan"),
    ).toBeInTheDocument();
    act(() => leave());
    await waitFor(() =>
      expect(screen.queryByText("Created an empty plan")).toBeNull(),
    );
  });
});
