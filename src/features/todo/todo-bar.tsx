import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { IsoDate } from "~/core/schema";
import {
  isThisWeek,
  newYorkClock,
  shiftWeek,
  weekStartOf,
  weekTitle,
} from "~/core/todo";
import { Button } from "~/ui/button";
import { BarTitle } from "~/ui/page-header";
import { WithTooltip } from "~/ui/tooltip";

// Todo's controls in the family bar (docs/decisions.md, "One bar at the
// top"): Back, Today and Ahead as outline buttons, and the week they show,
// short ("Sep 28 – Oct 4"), which is the page's title. Nothing else of
// Todo's is in the bar: adding a task, the week's progress and ELMS are the
// sidebar's (the owner, 2026-09-29: "i'm not a big fan of everything being
// thrown into the top bar for todos").

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
 * An outline button, sized for the bar at every width: a phone's bar gives
 * each control the bar's height to tap (styles.css), so it keeps 28px here
 * rather than the kit's 44px.
 */
const BAR_BUTTON = "max-md:h-7 max-md:px-2.5";
const BAR_ICON = "max-md:size-7";

/** Back, Today and Ahead, then the week: links, so each week is a URL. */
export function TodoBarContext({ anchor: asked }: { anchor?: IsoDate }) {
  const { today } = useNow();
  const anchor = asked ?? today;
  const current = isThisWeek(anchor, today);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 max-md:gap-2">
      <nav aria-label="Weeks" className="flex shrink-0 items-center gap-1.5">
        <WithTooltip label="Back a week" shortcut="P">
          <Button
            variant="outline"
            size="icon-sm"
            className={BAR_ICON}
            render={
              <Link
                to={TODO_PATH}
                search={{ date: shiftWeek(anchor, -1) }}
                aria-label="Back a week"
              />
            }
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
        </WithTooltip>
        <WithTooltip
          label={current ? "You're on this week" : "Show this week"}
          shortcut="T"
        >
          <Button
            variant="outline"
            size="sm"
            className={cn(
              BAR_BUTTON,
              // Still a stop for its tooltip, but nothing to do.
              current && "pointer-events-none opacity-50 shadow-none",
            )}
            render={
              <Link
                to={TODO_PATH}
                search={{}}
                aria-disabled={current || undefined}
                tabIndex={current ? -1 : undefined}
              />
            }
          >
            Today
          </Button>
        </WithTooltip>
        <WithTooltip label="Ahead a week" shortcut="N">
          <Button
            variant="outline"
            size="icon-sm"
            className={BAR_ICON}
            render={
              <Link
                to={TODO_PATH}
                search={{ date: shiftWeek(anchor, 1) }}
                aria-label="Ahead a week"
              />
            }
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </WithTooltip>
      </nav>
      <BarTitle
        title={
          <span className="tnum">{weekTitle(weekStartOf(anchor), today)}</span>
        }
      />
    </div>
  );
}
