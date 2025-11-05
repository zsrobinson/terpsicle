"use server";

import { getCoursesFromIO } from "./from-io";
import { getSectionsFromSOC } from "./from-soc";
import { IOSection } from "./types-io";

const semester = "202601";

export async function generate(requiredInput: string[]) {
  const optionalInput: string[] = [];

  const sections = await Promise.all(
    [...requiredInput, ...optionalInput].map((course_id) =>
      getSectionsFromSOC({ course_id, semester })
    )
  );

  const courses = await getCoursesFromIO({
    course_ids: [...requiredInput, ...optionalInput],
    semester,
  });

  const schedules = permutations(sections)
    .filter(isValidSchedule)
    .filter(hasRequiredCourses(requiredInput));

  return {
    schedules: schedules.slice(0, 50),
    length: schedules.length,
    courses,
  };
}

function permutations(required: IOSection[][]): IOSection[][] {
  console.log("RUNNING");
  if (required.length === 0) return [];
  if (required.length === 1) return required[0].map((s) => [s]);

  const [first, ...rest] = required;
  const restPerms = permutations(rest);

  const perms = [];
  for (const firstSec of first) {
    for (const restPermsSec of restPerms) {
      perms.push([firstSec, ...restPermsSec]);
    }
  }

  return perms;
}

function isValidSchedule(schedule: IOSection[]) {
  const days = ["M", "Tu", "W", "Th", "F"];
  return days.every((day) => isValidScheduleForDay(schedule, day));
}

// code copied from calendar.tsx just to get working
function isValidScheduleForDay(schedule: IOSection[], day: string): boolean {
  const todaySections = schedule
    .flatMap((sec) =>
      sec.meetings.map((meeting) => ({
        ...sec,
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

  // use overlap totals to determine if there's any overlaps
  if (overlapThings.length === 0) return true;
  return overlapThings.every((thing) => thing.oTotal === 1);
}

function hasRequiredCourses(required: string[]) {
  return function (schedule: IOSection[]): boolean {
    return required.every((course) =>
      schedule.some((sec) => sec.course === course)
    );
  };
}
