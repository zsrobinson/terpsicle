import { useState } from "react";
import { googleCalendarUrl, webcalUrl } from "~/core/ics/feed";
import { track } from "~/lib/analytics";
import { calendarFeedApi } from "~/server/fns/calendar-feed";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";

// The calendar feed's row on /settings/notifications (V2.md §6.7): a private
// link Apple, Google or Outlook Calendar subscribes to, holding your classes
// and Todo deadlines. The link is a secret: it lives only in this component's
// state, is asked for when you press Subscribe, and never goes to analytics.

type FeedState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "failed" };

const LOAD_FAILED =
  "Couldn't get your calendar link. Check your connection and try again.";
const RESET_FAILED =
  "Couldn't make a new link. Your old one still works. Check your connection and try again.";

export function CalendarFeedSection() {
  const [feed, setFeed] = useState<FeedState>({ kind: "idle" });
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setFeed({ kind: "loading" });
    setMessage(null);
    try {
      const result = await calendarFeedApi.link();
      if (result.created) track("calendar_feed_created", {});
      setFeed({ kind: "ready", url: result.url });
    } catch {
      setFeed({ kind: "failed" });
    }
  };

  const reset = async () => {
    setResetting(true);
    setMessage(null);
    try {
      const result = await calendarFeedApi.reset();
      track("calendar_feed_reset", {});
      setFeed({ kind: "ready", url: result.url });
      setMessage(
        "Made a new link. The old one stopped working, so add this one to your calendars again.",
      );
    } catch {
      setMessage(RESET_FAILED);
    }
    setResetting(false);
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      noteToast("Copied your calendar link", {
        id: "calendar-feed",
        description: "Paste it where your calendar app subscribes by URL.",
      });
    } catch {
      noteToast(
        "Couldn't copy: this browser blocked the clipboard. Allow it for this site and try again.",
        { id: "calendar-feed" },
      );
    }
  };

  return (
    <PageSection title="Calendar feed">
      <p className="text-muted">
        Your classes and Todo deadlines in Apple, Google or Outlook Calendar,
        kept up to date. Your calendar reminds you, with the alerts you already
        use.
      </p>
      {feed.kind === "ready" ? (
        <>
          {/* Autocapture never sees these links' hrefs (scrubUrl drops the
              token too, as a backstop). */}
          <div
            className="flex flex-col gap-2 sm:max-w-xs"
            data-ph-no-autocapture=""
          >
            <WithTooltip label="Opens Calendar on this device to subscribe">
              <Button render={<a href={webcalUrl(feed.url)} />}>
                Add to Apple Calendar
              </Button>
            </WithTooltip>
            <WithTooltip label="Opens Google Calendar in a new tab to subscribe">
              <Button
                variant="outline"
                render={
                  <a
                    href={googleCalendarUrl(feed.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Add to Google Calendar
              </Button>
            </WithTooltip>
            <WithTooltip label="For Outlook or any app that subscribes by URL">
              <Button variant="outline" onClick={() => void copy(feed.url)}>
                Copy the link
              </Button>
            </WithTooltip>
          </div>
          <p className="text-muted text-sm">
            The link is private: anyone with it can see these dates. Make a new
            one anytime and the old one stops working.
          </p>
          <div>
            <WithTooltip label="The old link stops working, and calendars using it stop updating">
              <Button
                variant="outline"
                size="sm"
                disabled={resetting}
                onClick={() => void reset()}
              >
                {resetting ? "Making a new link…" : "Make a new link"}
              </Button>
            </WithTooltip>
          </div>
        </>
      ) : feed.kind === "failed" ? (
        <InlineError
          message={LOAD_FAILED}
          onRetry={() => void load()}
          className="py-0"
        />
      ) : (
        <div>
          <WithTooltip label="Makes your private link to add to a calendar">
            <Button
              variant="outline"
              disabled={feed.kind === "loading"}
              onClick={() => void load()}
            >
              {feed.kind === "loading" ? "Getting your link…" : "Subscribe"}
            </Button>
          </WithTooltip>
        </div>
      )}
      {message ? (
        <p role="status" className="text-fg text-sm">
          {message}
        </p>
      ) : null}
      <p className="text-muted text-sm">
        <span className="font-medium text-fg">What's in it: </span>
        class meetings for this term and next, from each term's first plan in
        Schedule, with room and building; and Todo deadlines you haven't checked
        off, from ELMS, files and your own tasks, each with an alert a day
        before.
      </p>
    </PageSection>
  );
}
