import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { STAY_PARAM } from "~/core/routing";
import { WithTooltip } from "./tooltip";

// A page picks a width by how it's read; it never invents one
// (docs/COHESION.md §1.4). This is the page under the app bar: the frame
// draws the bar, and this draws `main` and, on pages you read, the footer.
//
//   note     560  one thing to read or one form: Settings, sign-in, not found
//   reading  720  prose and lists read top to bottom: Reviews, Privacy
//   app     1120  a list you scan across columns: Todo
//   full          a tool with panes, edge to edge: Chat's split
//
// Every width starts 16px under the bar, keeps a 16px gutter and never
// scrolls sideways; a canvas scrolls inside its own pane.

export type PageWidth = "note" | "reading" | "app" | "full";

/** The column's max width, by page kind. */
export const PAGE_WIDTH: Record<Exclude<PageWidth, "full">, string> = {
  note: "max-w-[560px]",
  reading: "max-w-[720px]",
  app: "max-w-[1120px]",
};

type ProductPageProps = {
  children: ReactNode;
  className?: string;
} & (
  | {
      width: "note" | "reading";
      /** Privacy and About Terpsicle; on by default. */
      footer?: boolean;
    }
  | {
      /** App pages and panes have no footer: nothing sits under a canvas. */
      width: "app" | "full";
      footer?: never;
    }
);

export function ProductPage(props: ProductPageProps) {
  const { width, children, className } = props;
  if (width === "full")
    return (
      <main className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {children}
      </main>
    );
  const footer =
    props.width === "note" || props.width === "reading"
      ? (props.footer ?? true)
      : false;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-4 px-4 pt-4 pb-8",
          PAGE_WIDTH[width],
          className,
        )}
      >
        {children}
      </main>
      {footer ? <PageFooter className={PAGE_WIDTH[width]} /> : null}
    </div>
  );
}

/** A 40px muted line: Privacy and About Terpsicle. Feedback is in the bar. */
export function PageFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mx-auto flex h-10 w-full shrink-0 items-center gap-4 px-4 text-muted text-sm",
        className,
      )}
    >
      <WithTooltip label="What Terpsicle keeps about you, and why">
        <Link to="/privacy" className="hover:text-fg">
          Privacy
        </Link>
      </WithTooltip>
      {/* ?stay: returning visitors would otherwise skip to the scheduler.
          A plain link, since `/` decides that before the router runs. */}
      <WithTooltip label="What Terpsicle is, and its five products">
        <a href={`/?${STAY_PARAM}`} className="hover:text-fg">
          About Terpsicle
        </a>
      </WithTooltip>
    </footer>
  );
}
