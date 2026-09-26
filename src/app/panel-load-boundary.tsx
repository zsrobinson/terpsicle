import { RotateCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { ChunkLoadError } from "./lazy-panel";
import { EmptyState, PanelHeader } from "./panel";

// A panel that loads on first use (lazyPanel) can fail to arrive:
// offline, or a deploy removed the old chunk. Say so in the panel, not the
// whole page. React keeps a failed lazy component failed, so the way out is
// a reload; plans, the open tab and the drill-in are saved, so nothing's lost.

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
    if (!(error instanceof ChunkLoadError)) throw error;
    return (
      <div role="alert" className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title={this.props.title} />
        <EmptyState
          action={
            <WithTooltip label="Reload the page to load this panel">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RotateCw size={13} aria-hidden="true" />
                Reload
              </Button>
            </WithTooltip>
          }
        >
          Couldn't load {this.props.title}. Check your connection, then reload.
          Your plans are saved.
        </EmptyState>
      </div>
    );
  }
}
