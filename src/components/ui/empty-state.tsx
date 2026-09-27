import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./button";
import { WithTooltip } from "./tooltip";

// The empty and first-visit template (docs/COHESION.md §1.6), the same in all
// five products: the product's mark, a headline, one sentence, then one
// filled action and at most a quiet link. Where the owner made the paths
// equal (Schedule's two ways to start, Plan's import or sample), they're two
// filled buttons of one size, and any third way is the quiet link. No cards
// around the paths: one composition, not a menu of boxes.
//
// A list's one-line "nothing here" note is `PanelNote` in src/app/panel.tsx.

/**
 * An action: a route to go to, something to do here, or an address outside
 * the router (sign-in's start, which the Worker answers).
 */
export type EmptyAction = {
  label: string;
  /** A 14px icon before the label (filled buttons only). */
  icon?: ReactNode;
  /** The tooltip, when the label alone doesn't say where it goes. */
  hint?: string;
  /** Its keyboard shortcut, shown in the tooltip ("/"). */
  shortcut?: string;
} & (
  | {
      to: LinkProps["to"];
      search?: LinkProps["search"];
      params?: LinkProps["params"];
    }
  | { onClick: () => void }
  | {
      href: string;
      /** Runs as the page leaves (analytics). */
      onClick?: () => void;
    }
);

type EmptyStateProps = {
  /** The product's `Mark` at 40px. */
  mark?: ReactNode;
  title: string;
  /** One sentence: what will appear here and how. */
  line: ReactNode;
  /** `start` on a page (at the top, left-aligned); `center` in a pane. */
  align?: "start" | "center";
  /** `h1` when it's the whole page (a first visit); `h2` in a page; `h3` in a panel. */
  headingLevel?: 1 | 2 | 3;
  className?: string;
} & (
  | {
      equal?: false;
      primary: EmptyAction;
      /** A quiet link after the button. */
      secondary?: EmptyAction;
      quiet?: never;
    }
  | {
      /** Two equal paths: both filled, the same size. */
      equal: true;
      primary: EmptyAction;
      secondary: EmptyAction;
      /** A third way, as a quiet link. */
      quiet?: EmptyAction;
    }
);

export function EmptyState(props: EmptyStateProps) {
  const {
    mark,
    title,
    line,
    align = "start",
    headingLevel = 2,
    primary,
    secondary,
    quiet,
    equal,
    className,
  } = props;
  const Heading = `h${headingLevel}` as const;
  const center = align === "center";
  const link = equal ? quiet : secondary;
  return (
    <div
      className={cn(
        "flex max-w-[460px] flex-col items-start gap-3",
        center && "m-auto items-center text-center",
        className,
      )}
    >
      {mark ? (
        <div className="flex size-10 items-center justify-center">{mark}</div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Heading className="font-semibold text-xl tracking-tight">
          {title}
        </Heading>
        <p className="text-pretty text-muted">{line}</p>
      </div>
      <div
        className={cn(
          "mt-1 flex flex-wrap items-center gap-3",
          center && "justify-center",
          equal && "self-stretch",
        )}
      >
        {/* Equal paths: both filled and the same size. They share a row
            equally, and when it's too narrow each takes a whole row. */}
        <ActionButton action={primary} className={equal ? EQUAL : undefined} />
        {equal ? <ActionButton action={secondary} className={EQUAL} /> : null}
        {link ? <QuietLink action={link} /> : null}
      </div>
    </div>
  );
}

function withHint(action: EmptyAction, node: ReactElement) {
  return action.hint ? (
    <WithTooltip label={action.hint} shortcut={action.shortcut}>
      {node}
    </WithTooltip>
  ) : (
    node
  );
}

/** An equal path: grows from nothing, so two share a row evenly. */
const EQUAL = "min-w-fit flex-1 basis-0";

function ActionButton({
  action,
  className,
}: {
  action: EmptyAction;
  className?: string;
}) {
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  return withHint(
    action,
    "href" in action ? (
      <Button size="lg" asChild className={className}>
        <a href={action.href} onClick={action.onClick}>
          {content}
        </a>
      </Button>
    ) : "onClick" in action ? (
      <Button size="lg" onClick={action.onClick} className={className}>
        {content}
      </Button>
    ) : (
      <Button size="lg" asChild className={className}>
        <Link to={action.to} search={action.search} params={action.params}>
          {content}
        </Link>
      </Button>
    ),
  );
}

const QUIET =
  "font-medium text-muted underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-fg hover:decoration-fg max-md:py-3";

function QuietLink({ action }: { action: EmptyAction }) {
  return withHint(
    action,
    "href" in action ? (
      <a href={action.href} onClick={action.onClick} className={QUIET}>
        {action.label}
      </a>
    ) : "onClick" in action ? (
      <button type="button" onClick={action.onClick} className={QUIET}>
        {action.label}
      </button>
    ) : (
      <Link
        to={action.to}
        search={action.search}
        params={action.params}
        className={QUIET}
      >
        {action.label}
      </Link>
    ),
  );
}
