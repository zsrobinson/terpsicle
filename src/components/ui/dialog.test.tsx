import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

function Install() {
  const [open, setOpen] = useState(false);
  const install = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Install Terpsicle
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            install.current?.focus();
          }}
        >
          <DialogTitle>Put Terpsicle on your home screen</DialogTitle>
          <DialogDescription asChild>
            <ul>
              <li>Opens like an app</li>
            </ul>
          </DialogDescription>
          <button type="button" onClick={() => setOpen(false)}>
            Not now
          </button>
          <button ref={install} type="button">
            Install
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("is named and described, focuses where it's told, and Esc hands focus back", async () => {
    render(<Install />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Install Terpsicle" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", {
      name: "Put Terpsicle on your home screen",
    });
    // The description is the list itself (asChild).
    expect(dialog).toHaveAccessibleDescription("Opens like an app");
    expect(screen.getByRole("list")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Install" })).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });
});
