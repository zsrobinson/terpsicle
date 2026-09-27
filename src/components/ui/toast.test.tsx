import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "~/ui/sonner";
import { dismissToast, noteToast, UNDO_MS, undoToast } from "~/ui/toast";
import { TooltipProvider } from "~/ui/tooltip";

function renderToaster() {
  render(
    <TooltipProvider delayDuration={0}>
      <Toaster />
    </TooltipProvider>,
  );
}

// Sonner removes a dismissed toast on a timer; waiting keeps that timer from
// firing after the DOM is torn down.
afterEach(async () => {
  vi.useRealTimers();
  toast.dismiss();
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
  );
});

describe("undoToast", () => {
  it("says what happened, and Undo runs once and closes it", async () => {
    renderToaster();
    const onUndo = vi.fn();
    const onDone = vi.fn();
    act(() =>
      undoToast({
        id: "t",
        message: "Review deleted",
        description: "From CMSC216",
        tooltip: "Put it back",
        onUndo,
        onDone,
      }),
    );
    expect(await screen.findByText("Review deleted")).toBeInTheDocument();
    expect(screen.getByText("From CMSC216")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText("Review deleted")).not.toBeInTheDocument(),
    );
    // Undone, so it never counts as done.
    expect(onDone).not.toHaveBeenCalled();
  });

  it("is done once its time runs out without Undo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderToaster();
    const onDone = vi.fn();
    act(() =>
      undoToast({
        id: "t",
        message: "ELMS disconnected",
        onUndo: vi.fn(),
        onDone,
      }),
    );
    await screen.findByText("ELMS disconnected");
    act(() => vi.advanceTimersByTime(UNDO_MS - 500));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("waits while Undo has focus, so a keyboard user never loses it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderToaster();
    const onDone = vi.fn();
    act(() =>
      undoToast({
        id: "t",
        message: "Removed STAT400",
        onUndo: vi.fn(),
        onDone,
      }),
    );
    const undo = await screen.findByRole("button", { name: "Undo" });
    act(() => undo.focus());
    act(() => vi.advanceTimersByTime(UNDO_MS * 2));
    expect(screen.getByText("Removed STAT400")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("replaces the last toast with the same id", async () => {
    renderToaster();
    act(() => undoToast({ id: "t", message: "First", onUndo: vi.fn() }));
    await screen.findByText("First");
    act(() => undoToast({ id: "t", message: "Second", onUndo: vi.fn() }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});

describe("undoToast, settling", () => {
  it("sends a replaced toast's change: a new one with its id settles it", async () => {
    renderToaster();
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    act(() =>
      undoToast({
        id: "t",
        message: "First",
        onUndo: vi.fn(),
        onDone: firstDone,
      }),
    );
    await screen.findByText("First");
    act(() =>
      undoToast({
        id: "t",
        message: "Second",
        onUndo: vi.fn(),
        onDone: secondDone,
      }),
    );
    expect(firstDone).toHaveBeenCalledTimes(1);
    expect(secondDone).not.toHaveBeenCalled();
  });

  it("settles a toast a note takes the place of", async () => {
    renderToaster();
    const onDone = vi.fn();
    act(() =>
      undoToast({ id: "t", message: "Watching", onUndo: vi.fn(), onDone }),
    );
    await screen.findByText("Watching");
    act(() => noteToast("Seat alerts are off right now.", { id: "t" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Seat alerts are off right now."),
    ).toBeInTheDocument();
  });

  it("never comes back once settled, even when Undo loses focus after", async () => {
    renderToaster();
    const onUndo = vi.fn();
    const onDone = vi.fn();
    act(() => undoToast({ id: "t", message: "Removed", onUndo, onDone }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    await userEvent.click(undo);
    act(() => undo.blur());
    await waitFor(() =>
      expect(screen.queryByText("Removed")).not.toBeInTheDocument(),
    );
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("undoToast, shown again", () => {
  it("shows a new toast with the id of one that just left (Delete, Undo, Delete)", async () => {
    renderToaster();
    act(() =>
      undoToast({ id: "t", message: "Review deleted", onUndo: vi.fn() }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    // Straight away, while the first is still on its way out.
    act(() =>
      undoToast({ id: "t", message: "Review deleted", onUndo: vi.fn() }),
    );
    expect(await screen.findByText("Review deleted")).toBeInTheDocument();
    // It stays: the leaving toast doesn't take it with it.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.getByText("Review deleted")).toBeInTheDocument();
  });

  it("dismissToast takes down a toast by our id", async () => {
    renderToaster();
    act(() => undoToast({ id: "t", message: "Removed", onUndo: vi.fn() }));
    await screen.findByText("Removed");
    act(() => dismissToast("t"));
    await waitFor(() =>
      expect(screen.queryByText("Removed")).not.toBeInTheDocument(),
    );
  });
});

describe("noteToast", () => {
  it("is a quiet line with nothing to press", async () => {
    renderToaster();
    act(() => noteToast("We couldn't join. Try again."));
    expect(
      await screen.findByText("We couldn't join. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Try again when retrying can help", async () => {
    renderToaster();
    const retry = vi.fn();
    act(() => noteToast("Couldn't load reviews", { id: "n", retry }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
