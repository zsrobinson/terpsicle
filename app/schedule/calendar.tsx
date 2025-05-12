"use client";

import { XIcon } from "lucide-react";
import { Dispatch, Fragment, SetStateAction } from "react";
import { formatTime } from "./course-list";
import { AddedSection, Schedule } from "./types";

const COURSE_COLORS = [
  "bg-red-500/30",
  "bg-blue-500/30",
  "bg-yellow-500/30",
  "bg-green-500/30",
  "bg-orange-500/30",
  "bg-cyan-500/30",
  "bg-fuchsia-500/30",
  "bg-violet-500/30",
] as const;

export function Calendar({
  setSearch,
  currentSchedule,
  addedSections,
  setAddedSections,
}: {
  setSearch: Dispatch<SetStateAction<string>>;
  currentSchedule: Schedule;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const days = ["M", "Tu", "W", "Th", "F"];

  const scheduleSections = addedSections.filter(
    (sec) =>
      sec.scheduleName === currentSchedule.name &&
      sec.term === currentSchedule.term
  );

  // prettier-ignore
  const start = Math.floor(scheduleSections.reduce(
    (acc, val) => Math.min(acc, 
      val.cachedSection.meetings.filter(met => met.start_time !== undefined && met.end_time !== undefined)
      .reduce((acc, val) => Math.min(acc, val.start_time!), Infinity)),
      Infinity) / 60) * 60; // ensures multiple of 60, breaks otherwise

  // prettier-ignore
  const end = Math.ceil(scheduleSections.reduce(
    (acc, val) => Math.max(acc, 
      val.cachedSection.meetings.filter(met => met.start_time !== undefined && met.end_time !== undefined)
      .reduce((acc, val) => Math.max(acc, val.end_time!), -Infinity)),
      -Infinity) / 60) * 60; // ensures multiple of 60, breaks otherwise

  const [padStart, padEnd] = padCalendarRange(start, end);

  return (
    <div className="flex flex-col w-full h-full">
      {/* render day headers */}
      <div className="flex justify-around ml-12 pb-2 gap-2">
        {days.map((day) => (
          <div className="font-semibold text-center" key={day}>
            {day}
          </div>
        ))}
      </div>

      <div className="h-full relative">
        {/* render class boxes */}
        <div className="ml-12 flex justify-around h-full gap-2">
          {days.map((day) => (
            <CalendarDay
              day={day}
              start={padStart}
              end={padEnd}
              setSearch={setSearch}
              currentSchedule={currentSchedule}
              addedSections={scheduleSections}
              setAddedSections={setAddedSections}
              key={day}
            />
          ))}
        </div>

        {/* render grid lines */}
        <div className="flex flex-col w-full absolute top-0 -z-10 h-full">
          {new Array((padEnd - padStart) / 60).fill(0).map((_, i) => (
            <Fragment key={i}>
              <div className="w-full border-t text-xs text-muted-foreground flex-1">
                {formatTime(padStart + 60 * i).replace(":00", "")}
              </div>
              <div className="w-full border-t text-xs text-muted-foreground border-dotted flex-1"></div>
            </Fragment>
          ))}
        </div>

        {/* {addedSections.length === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 text-muted-foreground flex flex-col items-center">
            <div className="relative pb-4">
              <TelescopeIcon className="text-muted-foreground" size={96} />
              <div className="z-10 bg-background/80 w-full h-full absolute top-0 left-0 " />
            </div>
            <p className="text-muted-foreground font-semibold">
              There&apos;s nothing here!
            </p>
            <p className="text-muted-foreground text-sm">
              Add some courses to get started.
            </p>
          </div>
        )} */}
      </div>
    </div>
  );
}

function CalendarDay({
  day,
  start,
  end,
  setSearch,
  currentSchedule,
  addedSections,
  setAddedSections,
}: {
  day: string;
  start: number;
  end: number;
  setSearch: Dispatch<SetStateAction<string>>;
  currentSchedule: Schedule;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  // filter down the sections into just today's
  const todaySections = addedSections
    .flatMap((addedSection) =>
      addedSection.cachedSection.meetings.map((meeting) => ({
        ...addedSection.cachedSection,
        meetings: undefined,
        meeting,
      }))
    )
    .filter((sec) => sec.meeting.days.includes(day))
    .filter(
      (sec) =>
        sec.meeting.start_time !== undefined &&
        sec.meeting.end_time !== undefined
    );

  // helper type for the block below, ts can't infer it
  type OverlapThing = (typeof todaySections)[0] & {
    oIndex: number;
    oTotal: number;
  };

  // compute the info needed to render overlapping classes properly
  const overlapThings = todaySections.reduce((acc: OverlapThing[], x) => {
    const overlap = acc.filter((sec) => {
      const { start_time: sec_start, end_time: sec_end } = sec.meeting;
      const { start_time: x_start, end_time: x_end } = x.meeting;

      if (!sec_start || !sec_end || !x_start || !x_end) return false; // ignore if there's not real times
      if (x_start >= sec_start && x_start < sec_end) return true; // option 1: x_start within sec_start...sec_end
      if (x_end > sec_start && x_end <= sec_end) return true; // option 2: x_end within sec_start...sec_end
      if (x_start < sec_start && x_end > sec_end) return true; // option 3: x_start before sec_start and x_end after sec_end
      return false; // otherwise not overlapping
    });

    const updatedAcc = acc.map((sec) => {
      const find = overlap.find(
        (o) =>
          o.section_id === sec.section_id &&
          JSON.stringify(o.meeting) === JSON.stringify(sec.meeting) // not great
      );
      if (find) find.oTotal++;
      return find ?? sec;
    });

    const maxTotal = overlap.reduce((acc, x) => Math.max(acc, x.oTotal), 1);
    return [...updatedAcc, { ...x, oIndex: maxTotal, oTotal: maxTotal }];
  }, []);

  return (
    <div className="relative w-full h-full text-center">
      {overlapThings.map((sec, i) => (
        <div
          key={sec.section_id + i}
          className={`absolute w-full p-2 flex flex-col items-center rounded-lg overflow-clip ${
            COURSE_COLORS[
              (addedSections
                .map((addedSec) => addedSec.id)
                .findIndex((addedSec) => addedSec === sec.section_id) ?? 0) %
                COURSE_COLORS.length
            ]
          }`}
          style={{
            height:
              ((sec.meeting.end_time! - sec.meeting.start_time!) /
                (end - start)) *
                100 +
              "%",
            top:
              ((sec.meeting.start_time! - start) / (end - start)) * 100 + "%",
            width: (1 / sec.oTotal) * 100 + "%",
            left: ((sec.oIndex - 1) / sec.oTotal) * 100 + "%",
          }}
        >
          <button
            className="leading-none font-semibold pb-1 cursor-pointer mx-4"
            onClick={() => setSearch(sec.course)}
          >
            {sec.course.slice(0, 4) + "\u200B" + sec.course.slice(4)}
          </button>
          <span className="leading-none text-xs">
            {formatTime(sec.meeting.start_time!)}–
            {formatTime(sec.meeting.end_time!)}
          </span>
          <span className="leading-none text-xs">
            {sec.meeting.building} {sec.meeting.room}
          </span>
          <span className="leading-none text-xs">{sec.instructors[0]}</span>

          <button
            className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground cursor-pointer"
            onClick={() => {
              setAddedSections((prev) =>
                prev.filter(
                  (addedSec) =>
                    !(
                      addedSec.id === sec.section_id &&
                      addedSec.term === currentSchedule.term &&
                      addedSec.scheduleName === currentSchedule.name
                    )
                )
              );
            }}
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Remove Class</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// makes sure that there's always at least 6 hours shown
function padCalendarRange(start: number, end: number) {
  if (start === Infinity || end === -Infinity) return [10 * 60, (12 + 4) * 60];
  if (end - start === 60) return [start - 2 * 60, end + 3 * 60];
  if (end - start === 2 * 60) return [start - 2 * 60, end + 2 * 60];
  if (end - start === 3 * 60) return [start - 60, end + 2 * 60];
  if (end - start === 4 * 60) return [start - 60, end + 60];
  if (end - start === 5 * 60) return [start, end + 60];
  return [start, end];
}
