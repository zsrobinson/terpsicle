import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { IsoDate } from "~/core/schema";
import {
  isThisWeek,
  newYorkClock,
  shiftWeek,
  weekStartOf,
  weekTitle,
} from "~/core/todo";
import { BarTitle } from "~/ui/page-header";
import { SEGMENT, SEGMENTS } from "~/ui/segmented-control";
import { WithTooltip } from "~/ui/tooltip";

// Todo's controls in the family bar (docs/decisions.md, "One bar at the
// top"): Back, Today and Ahead as one group, the kit's segments, and the
// week they show, short ("Sep 28 – Oct 4"), which is the page's title, with
// how ELMS is under it. The sync slot sits by the bell (./elms). Adding a
// task and the week's progress are the sidebar's (the owner, 2026-09-29:
// "i'm not a big fan of everything being thrown into the top bar for
// todos").

export const TODO_PATH = "/todo";
export const TODO_CONNECT_PATH = "/todo/connect";

/** New York's date and the time, ticking each minute for "synced 14 minutes ago". */
export function useNow(): { now: number; today: IsoDate } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { now, today: newYorkClock(now).date };
}

/**
 * The kit's segmented group (~/ui/segmented-control), as the bars' view
 * switches draw it: one bordered group, no offset shadow. 28px tall in a
 * phone's bar too, where each control gets the bar's height to tap
 * (styles.css).
 */
const GROUP = cn(SEGMENTS, "max-md:h-7");
const ARROW = cn(SEGMENT, "w-7 px-0 [&_svg]:size-4");

/** Back, Today and Ahead, then the week and how ELMS is: links, so each week is a URL. */
export function TodoBarContext({
  anchor: asked,
  status,
}: {
  anchor?: IsoDate;
  /** Under the week's dates: "ELMS synced 3 minutes ago". */
  status?: ReactNode;
}) {
  const { today } = useNow();
  const anchor = asked ?? today;
  const current = isThisWeek(anchor, today);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 max-md:gap-2">
      <nav aria-label="Weeks" className={GROUP}>
        <WithTooltip label="Back a week" shortcut="P">
          <Link
            to={TODO_PATH}
            search={{ date: shiftWeek(anchor, -1) }}
            aria-label="Back a week"
            className={ARROW}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        </WithTooltip>
        <WithTooltip
          label={current ? "You're on this week" : "Back to this week"}
          shortcut="T"
        >
          {current ? (
            // On this week, Today is the group's selected segment: filled,
            // as a view switch's current view is, and with nothing to do.
            // An <a> like its neighbors, so the group's borders match.
            // biome-ignore lint/a11y/useValidAnchor: a disabled link keeps its neighbors' tag and borders
            <a
              role="link"
              aria-disabled="true"
              aria-current="page"
              className={cn(SEGMENT, "cursor-default hover:bg-accent-soft")}
            >
              Today
            </a>
          ) : (
            <Link
              to={TODO_PATH}
              search={{}}
              // Never the router's "current" look: only this week is.
              activeOptions={{ exact: true }}
              className={SEGMENT}
            >
              Today
            </Link>
          )}
        </WithTooltip>
        <WithTooltip label="Ahead a week" shortcut="N">
          <Link
            to={TODO_PATH}
            search={{ date: shiftWeek(anchor, 1) }}
            aria-label="Ahead a week"
            className={ARROW}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </WithTooltip>
      </nav>
      <BarTitle
        title={
          <span className="tnum">{weekTitle(weekStartOf(anchor), today)}</span>
        }
        status={status}
      />
    </div>
  );
}
