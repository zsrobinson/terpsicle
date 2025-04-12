"use client";

import { Dispatch, Fragment, SetStateAction } from "react";
import { Course, Section } from "~/lib/types";
import { formatTime } from "./course-list";
import { XIcon } from "lucide-react";

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
              start={CAL_START}
              end={CAL_END}
              sections={filteredSections}
              addedSections={addedSections}
              setAddedSections={setAddedSections}
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
  addedSections,
  setAddedSections,
}: {
  day: string;
  start: number;
  end: number;
  sections: Section[];
  addedSections: string[];
  setAddedSections: Dispatch<SetStateAction<string[]>>;
}) {
  const todaySections = sections
    .filter((sec) => sec.times && sec.times.some((t) => t.day === day))
    .map((sec) => ({ ...sec, times: sec.times?.filter((t) => t.day === day) }));

  return (
    <div className="relative w-full h-full text-center">
      {todaySections.map((sec, i) => (
        <div
          key={i}
          className={`absolute w-full p-2 flex flex-col items-center rounded-lg ${
            COURSE_COLORS[
              (addedSections.findIndex(
                (str) => str === `${sec.courseCode}-${sec.sectionCode}`
              ) ?? 0) % COURSE_COLORS.length
            ]
          }`}
          style={{
            height:
              ((sec.times![0].end - sec.times![0].start) / (end - start)) *
                100 +
              "%",
            top: ((sec.times![0].start - start) / (end - start)) * 100 + "%",
          }}
        >
          <span className="leading-none font-semibold pb-1">
            {sec.courseCode}
          </span>{" "}
          <span className="leading-none text-xs">
            {formatTime(sec.times![0].start)}–{formatTime(sec.times![0].end)}
          </span>
          <span className="leading-none text-xs">{sec.times![0].location}</span>
          <span className="leading-none text-xs">{sec.professor}</span>
          <button
            onClick={() =>
              setAddedSections((prev) =>
                prev.filter((s) => s !== `${sec.courseCode}-${sec.sectionCode}`)
              )
            }
            className="absolute top-2 right-2"
          >
            <XIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
