"use client";

import { Dispatch, Fragment, SetStateAction } from "react";
import { Course, Section } from "~/lib/types";
import { formatTime } from "./course-list";

export function Calendar({
  sections,
  addedSections,
  setAddedSections,
}: {
  courses: Course[];
  sections: Section[];
  addedSections: string[];
  setAddedSections: Dispatch<SetStateAction<string[]>>;
}) {
  const days = ["M", "Tu", "W", "Th", "F"];

  // const [courses, setCourses] = useLocalStorage<Course[]>("courses", []);

  const filteredSections = sections.filter((s) =>
    addedSections.find(
      (as) =>
        as.split("-")[0] === s.courseCode && as.split("-")[1] === s.sectionCode
    )
  );

  const CAL_START = 8 * 60;
  const CAL_END = (12 + 4) * 60;

  return (
    <div className="flex flex-col w-full h-[700px]">
      {/* render day headers */}
      <div className="flex justify-around ml-12 pb-2">
        {days.map((day) => (
          <div className="font-semibold text-center" key={day}>
            {day}
          </div>
        ))}
      </div>

      <div className="h-full relative">
        {/* render class boxes */}
        <div className="ml-12 flex justify-around h-full">
          {days.map((day) => (
            <CalendarDay
              day={day}
              start={CAL_START}
              end={CAL_END}
              sections={filteredSections}
              key={day}
            />
          ))}
        </div>

        {/* render grid lines */}
        <div className="flex flex-col w-full absolute top-0 -z-10 h-full">
          {new Array((CAL_END - CAL_START) / 60).fill(0).map((_, i) => (
            <Fragment key={i}>
              <div className="w-full h-full border-t text-xs text-muted-foreground">
                {formatTime(CAL_START + 60 * i).replace(":00", "")}
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
  sections,
}: {
  day: string;
  start: number;
  end: number;
  sections: Section[];
}) {
  const todaySections = sections
    .filter((sec) => sec.times && sec.times.some((t) => t.day === day))
    .map((sec) => ({ ...sec, times: sec.times?.filter((t) => t.day === day) }));

  return (
    <div className="relative w-full h-full">
      {todaySections.map((sec, i) => (
        <div
          key={i}
          className="bg-red-500/50 absolute"
          style={{
            height:
              ((sec.times![0].end - sec.times![0].start) / (end - start)) *
                100 +
              "%",
            top: ((sec.times![0].start - start) / (end - start)) * 100 + "%",
          }}
        >
          {sec.courseCode}-{sec.sectionCode} {formatTime(sec.times![0].start)}
        </div>
      ))}
    </div>
  );
}
