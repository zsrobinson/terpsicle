"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Dispatch, Fragment, SetStateAction, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { fetchCourses, fetchSections } from "./fetch";
import { AddedSection, IOCourse } from "./types";

export function CourseList({
  addedSections,
  setAddedSections,
}: {
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const [search, setSearch] = useState("CMSC");
  const dept = search.slice(0, 4).toUpperCase();

  const coursesQuery = useQuery({
    queryKey: ["courses", dept],
    queryFn: () => fetchCourses({ dept_id: dept }),
    initialData: [],
  });

  const filteredCourses = coursesQuery.data.filter((c) =>
    c.course_id.toLowerCase().startsWith(search.toLowerCase())
  );

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
      </div>

      {filteredCourses.map((course, i) => (
        <CourseCard
          course={course}
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
  addedSections,
  setAddedSections,
}: {
  course: IOCourse;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const sectionQuery = useQuery({
    queryKey: ["section", course.course_id],
    queryFn: () => fetchSections({ course_id: course.course_id }),
  });

  return (
    <div className="border rounded-lg p-2 w-sm">
      <span className="font-semibold leading-none pb-1 text-xl">
        {course.course_id}
      </span>
      <span className="leading-none ml-1 text-muted-foreground text-sm italic">
        {course.credits} Credit{course.credits !== 1 && "s"}
      </span>
      <p className="leading-none text-balance">{course.name}</p>
      <hr className="my-2" />

      {sectionQuery.isLoading && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center">
          <LoaderCircleIcon className="animate-spin" size={20} /> Loading
          Sections
        </span>
      )}

      {sectionQuery.isError && (
        <span className="text-destructive flex items-center gap-2 justify-center">
          <TriangleAlertIcon size={20} /> Error Loading Sections
        </span>
      )}

      {sectionQuery.data?.map((sec, i) => (
        <Fragment key={i}>
          <div className="leading-tight">
            <div className="flex justify-between items-center">
              <div>
                <p>
                  <span className="font-semibold">{sec.number}</span>:{" "}
                  {sec.instructors[0] ?? "Instructor TBA"}
                </p>
                {sec.meetings.map((time, i) =>
                  time.start_time === undefined ||
                  time.end_time === undefined ? (
                    <p key={i}>ONLINE ASYNC</p>
                  ) : (
                    <p key={i}>
                      {time.days} {formatTime(time.start_time)}–
                      {formatTime(time.end_time)} {time.building} {time.room}{" "}
                      {time.classtype}
                    </p>
                  )
                )}
                {sec.open_seats}/{sec.seats} seats, {sec.waitlist} waitlist
              </div>

              {addedSections.some((str) => str === sec.section_id) ? (
                <Button
                  size="icon"
                  className="w-8 h-8"
                  onClick={() =>
                    setAddedSections((prev) =>
                      prev.filter((str) => str !== sec.section_id)
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
                    setAddedSections((prev) => [...prev, sec.section_id])
                  }
                >
                  <PlusIcon size={16} />
                </Button>
              )}
            </div>
          </div>

          {i < sectionQuery.data.length - 1 && <hr className="my-2" />}
        </Fragment>
      ))}
    </div>
  );
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
