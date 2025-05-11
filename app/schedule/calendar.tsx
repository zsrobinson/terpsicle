"use client";

import { useQueries } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { Dispatch, Fragment, SetStateAction } from "react";
import { formatTime } from "./course-list";
import { fetchSections } from "./fetch";
import { AddedSection, IOSection } from "./types";

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
  addedSections,
  setAddedSections,
}: {
  setSearch: Dispatch<SetStateAction<string>>;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const days = ["M", "Tu", "W", "Th", "F"];

  const DEFAULT_START = 9 * 60; // 8am
  const DEFAULT_END = (12 + 3) * 60; // 4pm

  const sectionsQuery = useQueries({
    queries: addedSections
      .map((section_id) => section_id.split("-")[0])
      .reduce<string[]>((acc, x) => (acc.includes(x) ? acc : [...acc, x]), [])
      .map((course_id) => ({
        queryKey: ["section", course_id],
        queryFn: () => fetchSections({ course_id }),
        initialData: [],
      })),
  });

  const sectionsData = sectionsQuery
    .flatMap((query) => query.data)
    .filter((sec) => addedSections.includes(sec.section_id));

  // prettier-ignore
  const start = Math.floor(sectionsData.reduce(
    (acc, val) => Math.min(acc, 
      val.meetings.filter(met => met.start_time !== undefined && met.end_time !== undefined)
      .reduce((acc, val) => Math.min(acc, val.start_time!), DEFAULT_START)),
      DEFAULT_START) / 60) * 60; // ensures multiple of 60, breaks otherwise

  // prettier-ignore
  const end = Math.ceil(sectionsData.reduce(
    (acc, val) => Math.max(acc, 
      val.meetings.filter(met => met.start_time !== undefined && met.end_time !== undefined)
      .reduce((acc, val) => Math.max(acc, val.end_time!), DEFAULT_END)),
      DEFAULT_END) / 60) * 60; // ensures multiple of 60, breaks otherwise

  return (
    <div className="flex flex-col w-full min-h-full">
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
              start={start}
              end={end}
              sectionsData={sectionsData}
              setSearch={setSearch}
              addedSections={addedSections}
              setAddedSections={setAddedSections}
              key={day}
            />
          ))}
        </div>

        {/* render grid lines */}
        <div className="flex flex-col w-full absolute top-0 -z-10 h-full">
          {new Array((end - start) / 60).fill(0).map((_, i) => (
            <Fragment key={i}>
              <div className="w-full h-full border-t text-xs text-muted-foreground">
                {formatTime(start + 60 * i).replace(":00", "")}
              </div>
              <div className="w-full h-full border-t text-xs text-muted-foreground border-dotted"></div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarDay({
  day,
  start,
  end,
  sectionsData,
  setSearch,
  addedSections,
  setAddedSections,
}: {
  day: string;
  start: number;
  end: number;
  sectionsData: IOSection[];
  setSearch: Dispatch<SetStateAction<string>>;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  // filter down the sections into just today's
  const todaySections = sectionsData
    .flatMap((section) =>
      section.meetings.map((meeting) => ({
        ...section,
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
      const find = overlap.find((o) => o.section_id === sec.section_id);
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
              (addedSections.findIndex((str) => str === sec.section_id) ?? 0) %
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
                prev.filter((str) => str !== sec.section_id)
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
