import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { HapticTap } from "./haptic";
import { OUTSIDE_TAB, OutsideArrow } from "./outside-link";
import { WithTooltip } from "./tooltip";

// One tab of the phone's tab bar (CONTEXT.md, "Tab bar"; the shell's
// ~/components/tab-bar puts six in a row): a mark over a one-word label, a
// real link the router preloads on intent, 44px tall, pressing to the soft
// gray at once and ticking on an iPhone. The tab you're on is
// `aria-current` and wears its product's soft color, as the desktop's
// tabs do; tapping it again doesn't navigate, it calls `onReselect` (back
// to the top, as iOS does). A tab that leaves Terpsicle (`outside`: Reviews
// while our pages are off) opens its site in a new tab, with the arrow after
// its label.

export function TabBarItem({
  to,
  label,
  icon,
  tooltip,
  current,
  currentClassName,
  onReselect,
  outside,
}: {
  to: string;
  /** One word, under the icon. */
  label: string;
  /** A 30px mark, drawn as decoration: the label names the tab. */
  icon: ReactNode;
  tooltip: string;
  current: boolean;
  /** The current tab's tint: its product's soft color. */
  currentClassName: string;
  /** A tap on the tab you're already on. */
  onReselect?: () => void;
  /** Another site's name: it opens in a new tab (`to` is its address). */
  outside?: string;
}) {
  const className = cn(
    "relative flex h-11 min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 text-muted outline-offset-[-2px]",
    // A finger's press shows at once; lifting it eases back.
    "transition-colors duration-(--dur-control) active:bg-hover active:duration-0",
    "[-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]",
    current && ["text-fg", currentClassName],
  );
  const body = (
    <>
      {icon}
      <span className="max-w-full truncate px-0.5 font-medium text-2xs leading-none tracking-[-0.005em]">
        {label}
        {outside ? (
          <>
            <span className="sr-only"> on {outside}</span>
            <OutsideArrow className="-mt-0.5 inline size-2.5 align-top" />
          </>
        ) : null}
      </span>
      <HapticTap />
    </>
  );
  if (outside)
    return (
      <WithTooltip label={tooltip} side="top">
        <a href={to} {...OUTSIDE_TAB} className={className}>
          {body}
        </a>
      </WithTooltip>
    );
  return (
    <WithTooltip label={tooltip} side="top">
      <Link
        to={to}
        preload="intent"
        aria-current={current ? "page" : undefined}
        onClick={(event) => {
          if (!current) return;
          event.preventDefault();
          onReselect?.();
        }}
        className={className}
      >
        {body}
      </Link>
    </WithTooltip>
  );
}
