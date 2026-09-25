// Rendering helpers for the shell's UI tests. Not used by the app.
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadStores } from "~/state/testing";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { AppShell, type AppShellProps } from "./app-shell";
import {
  createPanelRegistry,
  type PanelRegistration,
  PanelRegistryProvider,
} from "./registry";

/** The shell on the stub catalog with nothing saved yet, plus the toaster. */
export async function renderShell({
  panels = [],
  ...props
}: AppShellProps & { panels?: readonly PanelRegistration[] } = {}): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  setProps: (next: AppShellProps) => void;
}> {
  await loadStores();
  const user = userEvent.setup();
  const registry = createPanelRegistry(panels);
  const tree = (shellProps: AppShellProps) => (
    <TooltipProvider delayDuration={0}>
      <PanelRegistryProvider registry={registry}>
        <AppShell {...shellProps} />
      </PanelRegistryProvider>
      <Toaster />
    </TooltipProvider>
  );
  const result = render(tree(props));
  /** Re-renders with new props, as a URL change would. */
  const setProps = (next: AppShellProps) => result.rerender(tree(next));
  return { user, setProps };
}
