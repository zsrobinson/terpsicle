import { greeting } from "~/core/home";
import { weekdayOf } from "~/core/ics/dates";
import { HOME_PATH } from "~/core/routing";
import { DAY_LONG_NAMES, formatShortDate } from "~/core/time/format";
import { useAccount } from "~/features/auth/account-store";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { SitePage } from "~/features/site/site-page";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { ChatSection } from "./chat-section";
import { DueSection } from "./due-section";
import { PlanSection } from "./plan-section";
import { ReviewsSection } from "./reviews-section";
import { ScheduleSection } from "./schedule-section";
import { TodaySection } from "./today-section";
import {
  useHomeCampus,
  useHomeClock,
  useHomeLocal,
  useHomeTerms,
} from "./use-home";

// Home (docs/V3.md §1.5): where the installed app opens. A few facts from
// each product that matters today, each linking into it: today's classes,
// what's due, unread chat, the term you're registering for, Plan's
// progress and instructors to review. Hidden: nothing links here, and it
// isn't indexed. Phone-first: one column, today first; two columns from
// 768px. What's on the device shows at once; the rest fills in, each part
// holding its skeleton's height.

export function HomePage() {
  const clock = useHomeClock();
  const local = useHomeLocal();
  const { tags, calendars } = useHomeTerms(clock.today);
  // Walking times are worth the routes file only with classes today.
  const campus = useHomeCampus(
    local !== null &&
      tags.now !== null &&
      local.plans.some((p) => p.termId === tags.now),
  );
  const account = useAccount((s) => s.status);
  const flags = useAccount((s) => s.flags);
  const signedIn = account === "signed-in";
  const chatTerm = tags.now ?? tags.next;

  return (
    <SitePage layout="app">
      <PageHeader
        title={greeting(clock.minutes)}
        status={`${DAY_LONG_NAMES[weekdayOf(clock.today)]}, ${formatShortDate(clock.today)}`}
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <TodaySection
            clock={clock}
            local={local}
            now={tags.now}
            calendars={calendars}
            campus={campus}
            signedIn={signedIn}
          />
          {signedIn && flags.todo ? <DueSection clock={clock} /> : null}
          {signedIn && flags.chat !== "off" && chatTerm ? (
            <ChatSection termId={chatTerm} />
          ) : null}
        </div>
        {/* Under the first column on a phone: its first part keeps the rule every other part has. */}
        <div className="flex min-w-0 flex-col gap-6 max-md:[&>section:first-child]:border-t max-md:[&>section:first-child]:pt-3">
          <ScheduleSection local={local} next={tags.next} campus={campus} />
          {local?.fourYear && flags.plan ? (
            <PlanSection
              doc={local.fourYear}
              today={clock.today}
              calendars={calendars}
            />
          ) : null}
          {signedIn && flags.reviews === "on" && local ? (
            <ReviewsSection local={local} today={clock.today} />
          ) : null}
        </div>
      </div>
      {account === "signed-out" && flags.signIn ? <SignInSection /> : null}
    </SitePage>
  );
}

/** Signed out: what signing in adds here, and the one way to do it. */
function SignInSection() {
  return (
    <PageSection title="Sign in for more" className="md:w-[calc(50%-1rem)]">
      <p className="text-muted">
        Signed in, Home also shows what's due this week, unread messages in your
        class chats, seats that opened in sections you watch, and instructors
        you can review. Your schedules follow you to every device.
      </p>
      <GoogleButton returnTo={HOME_PATH} from="home" className="w-fit" />
    </PageSection>
  );
}
