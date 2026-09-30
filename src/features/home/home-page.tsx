import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  type CalloutId,
  chooseCallouts,
  greeting,
  termWeek,
} from "~/core/home";
import { weekdayOf } from "~/core/ics/dates";
import { mainPlanFor } from "~/core/plans/main-plan";
import type { CourseCode } from "~/core/schema";
import { DAY_LONG_NAMES, formatShortDate } from "~/core/time/format";
import { DEFAULT_WEEK_START } from "~/core/todo/weeks";
import { useAccount } from "~/features/auth/account-store";
import { SitePage } from "~/features/site/site-page";
import { PageHeader } from "~/ui/page-header";
import { HomeCallout, useDismissedCallouts } from "./callouts";
import { ChatSection } from "./chat-section";
import { ComingUpSection } from "./coming-up-section";
import { PlanSection } from "./plan-section";
import { chatRoomsQuery } from "./queries";
import { ReviewsSection } from "./reviews-section";
import { ScheduleSection } from "./schedule-section";
import { TodaySection } from "./today-section";
import {
  useHomeCampus,
  useHomeClock,
  useHomeColors,
  useHomeLocal,
  useHomeTerms,
  useHomeTodo,
} from "./use-home";
import { WeekSection } from "./week-section";

// Home (docs/V3.md §1.5): Terpsicle's first place, where the installed app
// opens and the bar's wordmark goes. Split by time, as the owner put it:
// "2/3 to current stuff and 1/3 to future stuff". Now, the wide column:
// today's classes, this week's deadlines class by class, unread chat.
// Next, the narrow one: the term you register for next, the four-year
// plan's credits, the deadlines after this week, and instructors to
// review. For a product you haven't set up, a callout stands where its
// part would be (two at most). On a phone it's one column, Now first.
// What's on the device shows at once; the account's parts fill in after
// the device's in each column, holding their skeleton's height.

export function HomePage() {
  const clock = useHomeClock();
  const local = useHomeLocal();
  const { tags, calendars, settled } = useHomeTerms(clock.today);
  // Walking times are worth the routes file only with classes today.
  const campus = useHomeCampus(
    local !== null &&
      tags.now !== null &&
      local.plans.some((p) => p.termId === tags.now),
  );
  const account = useAccount((s) => s.status);
  const flags = useAccount((s) => s.flags);
  const signedIn = account === "signed-in";
  // Todo's weeks, Monday to Sunday (docs/decisions.md, "Todo is one week").
  const weekStart = DEFAULT_WEEK_START;

  const todoOn = signedIn && flags.todo;
  const todo = useHomeTodo(clock.today, todoOn);
  const chatTerm = tags.now ?? tags.next;
  const chatOn = signedIn && flags.chat !== "off" && chatTerm !== null;
  const rooms = useQuery({ ...chatRoomsQuery(chatTerm), enabled: chatOn });
  const dismissed = useDismissedCallouts();

  const nowPlan =
    local && tags.now
      ? mainPlanFor(tags.now, local.plans, local.mainPlans)
      : null;
  const nextPlan =
    local && tags.next
      ? mainPlanFor(tags.next, local.plans, local.mainPlans)
      : null;
  const todoReady = todoOn && todo.phase === "ready";
  const todoConnected = todoReady && todo.connected;

  // One color per course across the page: Today's classes, the week's and chat's.
  const codes: CourseCode[] = [
    ...(nowPlan?.courses.map((c) => c.courseCode) ?? []),
    ...(todoConnected
      ? todo.items.flatMap((i) => {
          const code = todo.course(i).code;
          return code ? [code] : [];
        })
      : []),
    ...(rooms.data?.map((r) => r.courseCode) ?? []),
  ];
  const colors = useHomeColors(codes, todo.scheduler);

  const callouts = useMemo((): readonly CalloutId[] => {
    // Only once what's set up is known, so a callout never flashes by.
    if (local === null || !settled || dismissed === null) return [];
    if (account === "loading") return [];
    return chooseCallouts(
      {
        signedIn,
        signInOn: flags.signIn,
        todo: todoOn ? { connected: todoReady ? todo.connected : null } : null,
        chat: chatOn
          ? { active: rooms.isSuccess ? rooms.data.length > 0 : null }
          : null,
        plan: flags.plan ? { hasPlan: local.fourYear !== null } : null,
        nextTerm: tags.next
          ? {
              termId: tags.next,
              planned: (nextPlan?.courses.length ?? 0) > 0,
            }
          : null,
        now: tags.now,
      },
      dismissed,
      clock.today,
    );
  }, [
    local,
    settled,
    dismissed,
    account,
    signedIn,
    flags,
    todoOn,
    todoReady,
    todo.connected,
    chatOn,
    rooms.isSuccess,
    rooms.data,
    tags,
    nextPlan,
    clock.today,
  ]);
  const callout = (id: CalloutId) =>
    callouts.includes(id) ? (
      <HomeCallout
        id={id}
        today={clock.today}
        next={tags.next}
        now={tags.now}
      />
    ) : null;

  const week = tags.now ? termWeek(clock.today, tags.now, calendars) : null;
  const date = `${DAY_LONG_NAMES[weekdayOf(clock.today)]}, ${formatShortDate(clock.today)}`;
  const chatActive = rooms.isSuccess && rooms.data.length > 0;

  return (
    <SitePage layout="app">
      <PageHeader
        title={greeting(clock.minutes)}
        status={
          week && tags.now
            ? `${date} · Week ${week} of ${termLabel(tags.now)}`
            : date
        }
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
        <div
          data-home-column="now"
          className="flex min-w-0 flex-col gap-6 lg:col-span-2"
        >
          <TodaySection
            clock={clock}
            local={local}
            now={tags.now}
            calendars={calendars}
            campus={campus}
            signedIn={signedIn}
            colors={colors}
          />
          {todoOn && (!todoReady || todo.connected) ? (
            <WeekSection
              clock={clock}
              todo={todo}
              weekStart={weekStart}
              colors={colors}
            />
          ) : (
            callout("todo")
          )}
          {callout("sign-in")}
          {chatOn &&
          chatTerm &&
          (rooms.isPending || rooms.isError || chatActive) ? (
            <ChatSection termId={chatTerm} rooms={rooms} colors={colors} />
          ) : (
            callout("chat")
          )}
        </div>
        {/* Under Now on a phone: its first part keeps the rule every other part has. */}
        <div
          data-home-column="next"
          className="flex min-w-0 flex-col gap-6 max-lg:[&>section:first-child]:border-t max-lg:[&>section:first-child]:pt-3"
        >
          {tags.next && (nextPlan?.courses.length ?? 0) > 0 ? (
            <ScheduleSection local={local} next={tags.next} campus={campus} />
          ) : callouts.includes("next-term") ? (
            callout("next-term")
          ) : nextPlan ? (
            <ScheduleSection local={local} next={tags.next} campus={campus} />
          ) : null}
          {local?.fourYear && flags.plan ? (
            <PlanSection
              doc={local.fourYear}
              today={clock.today}
              calendars={calendars}
            />
          ) : (
            callout("plan")
          )}
          {todoConnected ? (
            <ComingUpSection
              clock={clock}
              todo={todo}
              weekStart={weekStart}
              colors={colors}
            />
          ) : null}
          {signedIn && flags.reviews === "on" && local ? (
            <ReviewsSection local={local} today={clock.today} />
          ) : null}
        </div>
      </div>
    </SitePage>
  );
}
