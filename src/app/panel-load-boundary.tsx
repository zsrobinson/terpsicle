import { Component, type ReactNode } from "react";
import { InlineError } from "~/ui/inline-error";
import { PanelHeader } from "./panel";

// A view that loads on first use (a route's chunk, the phone drawer) can
// fail to arrive: offline, or a deploy removed the old chunk. Say so in the
// panel, not the whole page. A failed lazy component stays failed, so the
// way out is a reload; plans and the view are saved, so nothing's lost.

/** A lazy chunk didn't arrive: offline, or a deploy removed it. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super("Couldn't load part of Terpsicle", { cause });
    this.name = "ChunkLoadError";
  }
}

/** A failed `import()`, in any browser's words, or our own ChunkLoadError. */
export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof ChunkLoadError) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return (
    typeof message === "string" &&
    /^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)/.test(
      message,
    )
  );
}

export class PanelLoadBoundary extends Component<
  { title: string; children: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    // Only a chunk that didn't arrive is this boundary's; a bug goes on up.
    if (!isChunkLoadError(error)) throw error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title={this.props.title} />
        <InlineError
          className="px-4"
          message={`Couldn't load ${this.props.title}. Check your connection, then reload. Your plans are saved.`}
          reload
          retryTooltip={`Reload Terpsicle to load ${this.props.title}`}
        />
      </div>
    );
  }
}
