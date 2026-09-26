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
  preloadAll,
} from "./registry";

/** The shell on the stub catalog with nothing saved yet, plus the toaster. */
export async function renderShell({
  panels = [],
  preload = true,
  ...props
}: AppShellProps & {
  panels?: readonly PanelRegistration[];
  /** Load lazy panels before rendering (false to test their loading). */
  preload?: boolean;
} = {}): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  setProps: (next: AppShellProps) => void;
}> {
  await loadStores();
  const user = userEvent.setup();
  const registry = createPanelRegistry(panels);
  // Lazy panels load before the first render, as if their tabs were hovered;
  // the shell's own test covers the skeleton they show while loading.
  if (preload) await preloadAll(registry);
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
