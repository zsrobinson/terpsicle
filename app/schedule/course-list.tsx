"use client";

import { useQuery } from "@tanstack/react-query";
import { MinusIcon, PlusIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Dispatch, Fragment, SetStateAction, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Course, Defined, Section } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";

const TERM = "202508";

export function CourseList({
  addedSections,
  setAddedSections,
}: {
  addedSections: (Section & { course: Course })[];
  setAddedSections: Dispatch<SetStateAction<(Section & { course: Course })[]>>;
}) {
  const [search, setSearch] = useState("");
  const dept = search.slice(0, 4).toUpperCase();

  const coursesQuery = useQuery({
    queryKey: ["courses", dept],
    queryFn: async () => {
      if (dept.length < 4) return [] as Course[];
      const res = await fetch(`/api/courses?dept=${dept}`);
      const json = (await res.json()) as Course[];
      return json;
    },
    initialData: [],
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", dept],
    queryFn: async () => {
      if (dept.length < 4) return [] as Section[];
      const res = await fetch(`/api/sections?dept=${dept}`);
      const json = (await res.json()) as Section[];
      return json;
    },
    initialData: [],
  });

  const filteredCourses = coursesQuery.data.filter((c) =>
    c.code.toLowerCase().startsWith(search.toLowerCase())
  );

  const [, setStoredCourses] = useLocalStorage<{
    [semesterId: string]: Course[];
  }>("semester-courses", {});

  return (
    <div className="flex flex-col gap-4 p-4 -m-4 overflow-y-scroll min-w-max pr-4">
      <div className="w-sm flex gap-4">
        <Input
          value={search}
          onChange={(e) =>
            setSearch(e.target.value.toUpperCase().replace(" ", ""))
          }
          placeholder="Search (eg. MATH, CMSC4)"
        />

        <Button
          onClick={() => {
            setStoredCourses((prev) => ({
              ...prev,
              [TERM]: addedSections.map((section) => section.course),
            }));
            redirect(`/degree#${TERM}`);
          }}
        >
          Commit to Plan
        </Button>
      </div>

      {filteredCourses.length === 0 &&
        addedSections
          .map((sec) => sec.course)
          .reduce<Course[]>(
            (acc, val) =>
              acc.some((c) => c.code === val.code) ? acc : [...acc, val],
            []
          )
          .map((course, i) => (
            <CourseCard
              course={course}
              sections={addedSections.filter(
                (s) => s.courseCode === course.code
              )}
              addedSections={addedSections}
              setAddedSections={setAddedSections}
              key={i}
            />
          ))}

      {filteredCourses.map((course, i) => (
        <CourseCard
          course={course}
          sections={sectionsQuery.data.filter(
            (s) => s.courseCode === course.code
          )}
          addedSections={addedSections}
          setAddedSections={setAddedSections}
          key={i}
        />
      ))}
    </div>
  );
}

function CourseCard({
  course,
  sections,
  addedSections,
  setAddedSections,
}: {
  course: Course;
  sections: Section[];
  addedSections: Section[];
  setAddedSections: Dispatch<SetStateAction<(Section & { course: Course })[]>>;
}) {
  return (
    <div className="border rounded-lg p-2 w-sm">
      <span className="font-semibold leading-none pb-1 text-xl">
        {course.code}
      </span>
      <span className="leading-none ml-1 text-muted-foreground text-sm italic">
        {course.credits} Credits
      </span>
      <p className="leading-none text-balance">{course.name}</p>
      <hr className="my-2" />

      {sections.length === 0 && <span>Loading sections</span>}

      {sections.map((s, i) => (
        <Fragment key={i}>
          <div className="leading-tight">
            <div className="flex justify-between items-center">
              <div>
                <p>
                  <span className="font-semibold">{s.sectionCode}</span>:{" "}
                  {s.professor}
                </p>
                {s.times &&
                  groupTimes(s.times).map((t, i) => (
                    <p key={i}>
                      {t.day} {formatTime(t.start)}–{formatTime(t.end)}{" "}
                      {t.location} {t.isDiscussion && "Discussion"}
                    </p>
                  ))}
                {s.openSeats}/{s.totalSeats} seats, {s.waitlistSeats} waitlist
              </div>

              {addedSections.some((sec) => sameSection(sec, s)) ? (
                <Button
                  size="icon"
                  className="w-8 h-8"
                  onClick={() =>
                    setAddedSections((prev) =>
                      prev.filter((sec) => !sameSection(sec, s))
                    )
                  }
                >
                  <MinusIcon size={16} />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="w-8 h-8"
                  variant="secondary"
                  onClick={() =>
                    setAddedSections((prev) => [...prev, { ...s, course }])
                  }
                >
                  <PlusIcon size={16} />
                </Button>
              )}
            </div>
          </div>

          {i < sections.length - 1 && <hr className="my-2" />}
        </Fragment>
      ))}
    </div>
  );
}

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

export function formatTime(dateNum: number) {
  const hour = Math.floor(dateNum / 60);
  const minute = dateNum % 60;

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date
    .toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" PM", "pm")
    .replace(" AM", "am");
}

export function sameSection(a: Section, b: Section) {
  return a.courseCode === b.courseCode && a.sectionCode === b.sectionCode;
}
