"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Dispatch, Fragment, SetStateAction, useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
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
  const [search, setSearch] = useState("");
  const dept = search.length >= 4 ? search.slice(0, 4).toUpperCase() : "";

  const coursesQuery = useQuery({
    queryKey: ["courses", dept],
    queryFn: () => fetchCourses({ dept_id: dept }),
    enabled: dept != "",
  });

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

      {coursesQuery.isLoading && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          <LoaderCircleIcon className="animate-spin" size={16} /> Loading
          Courses
        </span>
      )}

      {coursesQuery.isError && (
        <span className="text-destructive flex items-center gap-2 justify-center text-sm">
          <TriangleAlertIcon size={16} /> Error Loading Courses
        </span>
      )}

      {coursesQuery.data?.length === 0 && dept !== "" && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          No Courses
        </span>
      )}

      {dept === "" && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          Search to View Courses
        </span>
      )}

      {coursesQuery.data
        ?.filter((c) =>
          c.course_id.toLowerCase().startsWith(search.toLowerCase())
        )
        .map((course, i) => (
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
  const [ref, inView] = useInView({ rootMargin: "512px" });
  const [hasBeenInView, setHasBeenInView] = useState(false);

  useEffect(() => {
    if (inView) setHasBeenInView(true);
  }, [inView]);

  const sectionQuery = useQuery({
    queryKey: ["section", course.course_id],
    queryFn: () => fetchSections({ course_id: course.course_id }),
    enabled: hasBeenInView,
  });

  return (
    <div className="border rounded-lg p-2 w-sm" ref={ref}>
      <span className="font-semibold leading-none pb-1 text-xl">
        {course.course_id}
      </span>
      <span className="leading-none ml-1.5 text-muted-foreground text-sm italic">
        {course.credits} Credit{course.credits !== 1 && "s"}
      </span>
      <p className="leading-tight text-balance">{course.name}</p>
      <hr className="my-2" />

      {sectionQuery.isLoading && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          <LoaderCircleIcon className="animate-spin" size={16} /> Loading
          Sections
        </span>
      )}

      {sectionQuery.isError && (
        <span className="text-destructive flex items-center gap-2 justify-center text-sm">
          <TriangleAlertIcon size={16} /> Error Loading Sections
        </span>
      )}

      {sectionQuery.data?.length === 0 && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          No Sections
        </span>
      )}

      {sectionQuery.data?.map((sec, i) => (
        <Fragment key={i}>
          <div className="leading-tight">
            <div className="flex justify-between items-center">
              <div>
                <p>
                  <span className="font-semibold">{sec.number}:</span>{" "}
                  {sec.instructors[0] ?? "Instructor TBA"}
                </p>
                {sec.meetings.map((time, i) =>
                  time.start_time === undefined ||
                  time.end_time === undefined ? (
                    <p
                      className="text-muted-foreground text-sm leading-tight"
                      key={i}
                    >
                      ONLINE ASYNC
                    </p>
                  ) : (
                    <p
                      className="text-muted-foreground text-sm leading-tight"
                      key={i}
                    >
                      {time.days} {formatTime(time.start_time)}–
                      {formatTime(time.end_time)} {time.building} {time.room}{" "}
                      {time.classtype}
                    </p>
                  )
                )}
                <p className="text-muted-foreground text-sm leading-tight">
                  {sec.open_seats}/{sec.seats} seats, {sec.waitlist} waitlist
                </p>
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
