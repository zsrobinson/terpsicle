"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Dispatch, Fragment, SetStateAction, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { Button } from "~/components/ui/button";
import { fetchCourses, fetchSections } from "./io-fetch";
import { AddedSection, IOCourse, Schedule } from "./io-types";
import { fetchProfessor } from "./pt-fetch";

const RATING_COLORS = [
  "text-muted-foreground bg-secondary",
  "text-white bg-red-600/70",
  "text-white bg-amber-600/70",
  "text-white bg-lime-600/70",
  "text-white bg-green-700/70",
  "text-white bg-emerald-800/70",
];

export function CourseList({
  term,
  currentSchedule,
  search,
  addedSections,
  setAddedSections,
}: {
  term: string;
  currentSchedule: Schedule;
  search: string;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const dept = search.length >= 4 ? search.slice(0, 4).toUpperCase() : "";

  const coursesQuery = useInfiniteQuery({
    queryKey: ["courses", dept, term],
    queryFn: ({ pageParam }) =>
      fetchCourses({ dept_id: dept, page: pageParam, semester: term }),
    enabled: dept != "",
    initialPageParam: 1,
    getNextPageParam: (lastPage, _, lastPageParam) => {
      if (lastPage.length === 0) return undefined;
      return lastPageParam + 1;
    },
  });

  const [ref, inView] = useInView({ rootMargin: "256px" });

  useEffect(() => {
    if (inView && coursesQuery.hasNextPage) {
      coursesQuery.fetchNextPage();
    }
  }, [inView, coursesQuery]);

  return (
    <div className="flex flex-col gap-4 overflow-y-scroll pr-4 w-sm">
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

      {coursesQuery.data?.pages.flat().length === 0 && dept !== "" && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          No Courses
        </span>
      )}

      {dept === "" && (
        <span className="text-muted-foreground flex items-center gap-2 justify-center text-sm">
          Search to View Courses
        </span>
      )}

      <div className="flex flex-col gap-4" ref={ref}>
        {coursesQuery.data?.pages
          .flat()
          .filter((c) =>
            c.course_id.toLowerCase().startsWith(search.toLowerCase())
          )
          .map((course, i) => (
            <CourseCard
              term={term}
              currentSchedule={currentSchedule}
              course={course}
              addedSections={addedSections}
              setAddedSections={setAddedSections}
              key={i}
            />
          ))}
      </div>

      <div className="w-full h-4" ref={ref} />
    </div>
  );
}

function CourseCard({
  term,
  currentSchedule,
  course,
  addedSections,
  setAddedSections,
}: {
  term: string;
  currentSchedule: Schedule;
  course: IOCourse;
  addedSections: AddedSection[];
  setAddedSections: Dispatch<SetStateAction<AddedSection[]>>;
}) {
  const [ref, inView] = useInView({ rootMargin: "512px", triggerOnce: true });

  const sectionQuery = useQuery({
    queryKey: ["section", course.course_id, term],
    queryFn: () =>
      fetchSections({ course_id: course.course_id, semester: term }),
    enabled: inView,
  });

  return (
    <div className="border rounded-lg p-2 max-w-sm" ref={ref}>
      <div className="flex justify-between">
        <div>
          <span className="font-semibold leading-none pb-1 text-xl">
            {course.course_id}
          </span>
          <span className="leading-none ml-1.5 text-muted-foreground text-sm italic">
            {course.credits} Credit{course.credits !== 1 && "s"}
          </span>
        </div>

        <a
          href={`https://app.testudo.umd.edu/soc/search?courseId=${course.course_id}&termId=${term}&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=`}
          target="_blank"
          className="ml-1.5 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          Testudo <ExternalLinkIcon className="inline opacity-80" size={16} />
        </a>
      </div>

      <p className="leading-tight font-semibold">{course.name}</p>
      {course.gen_ed.length > 0 && (
        <p className="leading-tight text-muted-foreground text-sm">
          <span className="font-semibold">Gen-Eds:</span>{" "}
          {course.gen_ed.map((arr) => arr.join(", ")).join(" or ")}
        </p>
      )}
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
                <div className="flex gap-1 items-start">
                  <span className="font-semibold">{sec.number}:</span>
                  <div className="flex flex-col gap-0.5">
                    {sec.instructors.length === 0 ? (
                      <p>Instructor TBA</p>
                    ) : (
                      sec.instructors.map((name) => (
                        <ProfessorInfo key={name} name={name} />
                      ))
                    )}
                  </div>
                </div>
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
                  {sec.seats} total,{" "}
                  <span className="font-semibold">{sec.open_seats} open</span>,{" "}
                  {sec.waitlist} waitlist
                </p>
              </div>

              {addedSections.some(
                (addedSec) =>
                  addedSec.id === sec.section_id &&
                  addedSec.term === sec.semester &&
                  addedSec.scheduleName === currentSchedule.name
              ) ? (
                <Button
                  size="icon"
                  className="w-8 h-8"
                  onClick={() =>
                    setAddedSections((prev) =>
                      prev.filter(
                        (addedSec) =>
                          !(
                            addedSec.id === sec.section_id &&
                            addedSec.term === sec.semester &&
                            addedSec.scheduleName === currentSchedule.name
                          )
                      )
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
                    setAddedSections((prev) => [
                      ...prev,
                      {
                        id: sec.section_id,
                        term,
                        scheduleName: currentSchedule.name,
                        cachedCourse: course,
                        cachedSection: sec,
                      },
                    ])
                  }
                >
                  <PlusIcon size={16} />
                </Button>
              )}
            </div>
          </div>

          {i < sectionQuery.data.length - 1 && (
            <hr className="my-2 border-dotted" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function ProfessorInfo({ name }: { name: string }) {
  const professorQuery = useQuery({
    queryKey: ["professor", name],
    queryFn: () => fetchProfessor({ name }),
    retry: false,
  });

  return (
    <p>
      {name}
      <a
        href={
          professorQuery.data?.slug
            ? `https://planetterp.com/professor/${professorQuery.data?.slug}`
            : `https://planetterp.com`
        }
        target="_blank"
        className={`ml-2 px-1.5 py-0.5 font-semibold text-sm leading-none rounded-sm ${
          RATING_COLORS[Math.floor(professorQuery.data?.average_rating ?? 0)]
        }`}
      >
        {professorQuery.data?.average_rating.toFixed(2)}
        {professorQuery.isLoading && "..."}
        {professorQuery.isError && "n/a"}
      </a>
    </p>
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
