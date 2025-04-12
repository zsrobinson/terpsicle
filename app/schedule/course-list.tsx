"use client";

import { Fragment, useState } from "react";
import { Input } from "~/components/ui/input";
import { Course, Section } from "~/lib/types";

export function CourseList({
  courses,
  sections,
}: {
  courses: Course[];
  sections: Section[];
}) {
  const [search, setSearch] = useState("");
  const filtered = courses.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.map((course, i) => (
        <CourseCard
          course={course}
          sections={sections.filter((s) => s.courseCode === course.code)}
          key={i}
        />
      ))}
    </div>
  );
}

function CourseCard({
  course,
  sections,
}: {
  course: Course;
  sections: Section[];
}) {
  return (
    <div className="border rounded-lg p-2 max-w-sm">
      <p className="font-semibold leading-none pb-1">{course.code}</p>
      <p className="leading-none text-balance">{course.name}</p>
      <hr className="my-1" />

      {sections.map((s, i) => (
        <Fragment key={i}>
          <div className="leading-none">
            {s.sectionCode} {s.professor}
            {s.times &&
              groupTimes(s.times).map((t, i) => (
                <p key={i}>
                  {t.day} {t.location} {formatTime(t.start)}–{formatTime(t.end)}{" "}
                  {t.isDiscussion && "Dis"}
                </p>
              ))}
          </div>
          {i < sections.length - 1 && <hr className="my-2" />}
        </Fragment>
      ))}
    </div>
  );
}

type Defined<T> = T extends null | undefined ? never : T;
function groupTimes(
  times: Defined<Section["times"]>
): Defined<Section["times"]> {
  const output: Defined<Section["times"]> = [];

  for (const time of times) {
    const index = output.findIndex(
      (t) =>
        t.isDiscussion == time.isDiscussion &&
        t.location == time.location &&
        formatTime(t.start) == formatTime(time.start) &&
        formatTime(t.end) == formatTime(time.end)
    );

    if (index >= 0) {
      output[index].day += time.day;
    } else {
      output.push({ ...time });
    }
  }

  return output;
}

function formatTime(date: Date) {
  return date
    .toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" PM", "pm")
    .replace(" AM", "am");
}
