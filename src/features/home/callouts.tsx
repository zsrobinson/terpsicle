import { Link, type LinkProps } from "@tanstack/react-router";
import { X } from "lucide-react";
import { type ReactNode, useCallback, useId } from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { termLabel } from "~/core/catalog/terms";
import {
  type CalloutId,
  dismissedCallouts,
  inRegistrationSeason,
  withCalloutDismissed,
} from "~/core/home";
import { HOME_PATH } from "~/core/routing";
import type { IsoDate, TermId } from "~/core/schema";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import {
  saveSyncedPrefs,
  useAccountPrefsSettled,
  useSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import { track } from "~/lib/analytics";
import type { MarkId } from "~/lib/brand/marks";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";

// Home's setup callouts (docs/V3.md §1.5): for a product you haven't set
// up, one quiet card where its part of Home would be, saying what you'd
// see there and linking to the one step that sets it up. Closing one keeps
// it closed (a synced pref, so every device agrees once you're signed in),
// with Undo. `chooseCallouts` (~/core/home) picks which, two at most.

/** The callouts you've closed; null until they can be read (the account's, signed in). */
export function useDismissedCallouts(): ReadonlySet<string> | null {
  const prefs = useSyncedPrefs();
  const settled = useAccountPrefsSettled();
  if (prefs === null || !settled) return null;
  return dismissedCallouts(prefs);
}

/** One toast for callouts: closing another replaces the last one's Undo. */
const CALLOUT_TOAST_ID = "home-callout";

function useDismiss(id: CalloutId): () => void {
  return useCallback(() => {
    track("home_callout_dismissed", { callout: id });
    void saveSyncedPrefs((p) => withCalloutDismissed(p, id, true));
    undoToast({
      id: CALLOUT_TOAST_ID,
      message: "You won't see that on Home again",
      tooltip: "Show it again",
      onUndo: () =>
        void saveSyncedPrefs((p) => withCalloutDismissed(p, id, false)),
    });
  }, [id]);
}

/** What each callout says, and its one step. */
type Words = {
  mark: MarkId;
  title: string;
  line: string;
  action: ReactNode;
};

/** The one step, as the kit's outline button: a link into the product. */
function StepLink({
  id,
  label,
  hint,
  to,
  search,
}: {
  id: CalloutId;
  label: string;
  /** Its tooltip: where it goes. */
  hint: string;
  to: LinkProps["to"];
  search?: LinkProps["search"];
}) {
  return (
    <WithTooltip label={hint}>
      <Button
        variant="outline"
        className="w-fit"
        render={
          <Link
            to={to}
            search={search}
            onClick={() => track("home_callout_followed", { callout: id })}
          />
        }
      >
        {label}
      </Button>
    </WithTooltip>
  );
}

function wordsFor(
  id: CalloutId,
  context: { today: IsoDate; next: TermId | null; now: TermId | null },
): Words | null {
  switch (id) {
    case "todo":
      return {
        mark: "todo",
        title: "See this week's assignments here",
        line: "Connect your ELMS calendar, and Home shows what's due in each class, with what's done and what's left.",
        action: (
          <StepLink
            id={id}
            label="Connect ELMS"
            hint="Paste your ELMS calendar link in Todo"
            to="/todo/connect"
          />
        ),
      };
    case "chat":
      return {
        mark: "chat",
        title: "Every class has a chat room",
        line: "Ask about the homework, find a study group or compare notes with the people in your sections.",
        action: (
          <StepLink
            id={id}
            label="Open Chat"
            hint="Your class chats"
            to="/chat"
            search={context.now ? { term: context.now } : undefined}
          />
        ),
      };
    case "next-term": {
      const next = context.next;
      if (next === null) return null;
      const term = termLabel(next);
      return {
        mark: "schedule",
        title: `Build your ${term} schedule`,
        line: inRegistrationSeason(context.today, next)
          ? "Registration's coming up. Pick your sections, see what fits your week and watch full ones for an open seat."
          : "Pick your sections, see what fits your week, and walk into registration with a plan.",
        action: (
          <StepLink
            id={id}
            label="Start a plan"
            hint={`Open Schedule for ${term}`}
            to="/schedule"
            search={{ term: next }}
          />
        ),
      };
    }
    case "plan":
      return {
        mark: "plan",
        title: "Map out your four years",
        line: "Lay out every semester and watch your credits and GenEds add up. Start from your transcript or a sample plan.",
        action: (
          <StepLink
            id={id}
            label="Start a four-year plan"
            hint="Open Plan"
            to="/plan"
          />
        ),
      };
    case "sign-in":
      return {
        mark: "umbrella",
        title: "Sign in for more",
        line: "Signed in, Home also shows what's due in each class, your class chats and instructors you can review, and your schedules follow you to every device.",
        action: (
          <GoogleButton
            returnTo={HOME_PATH}
            from="home"
            onStart={() => track("home_callout_followed", { callout: id })}
            className="w-fit"
          />
        ),
      };
  }
}

/** One callout: the product's mark, what you'd get, its step, and Close. */
export function HomeCallout({
  id,
  today,
  next,
  now,
}: {
  id: CalloutId;
  today: IsoDate;
  next: TermId | null;
  now: TermId | null;
}) {
  const dismiss = useDismiss(id);
  const titleId = useId();
  const words = wordsFor(id, { today, next, now });
  if (!words) return null;
  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      data-home-callout={id}
      className="flex-row items-start gap-3 p-4"
    >
      <IntegrationLabel product={words.mark} iconOnly className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="emph-heading text-base">
            {words.title}
          </h2>
          {/* A readable line in Now's wide column. */}
          <p className="emph-secondary max-w-[62ch] text-pretty text-sm">
            {words.line}
          </p>
        </div>
        {words.action}
      </div>
      <WithTooltip label="Don't show this again">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Close "${words.title}"`}
          onClick={dismiss}
          className="-mt-1.5 -mr-1.5"
        >
          <X aria-hidden="true" />
        </Button>
      </WithTooltip>
    </Card>
  );
}
