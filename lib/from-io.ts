import {
  courseSchema,
  IOCourse,
  IOSection,
  sectionSchema,
} from "~/lib/types-io";

const API = "https://api.umd.io/v1";

function parseOptions(options: {
  [key: string]: string | number | undefined;
}): { [key: string]: string } {
  return Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .reduce((parsed, [key, value]) => {
      return { ...parsed, [key]: String(value) };
    }, {});
}

/** @see https://beta.umd.io/#operation/getCourses */
export async function getDeptCoursesFromIO(options: {
  sort?: string;
  page?: number;
  per_page?: number;
  semester: string;
  credits?: string;
  dept_id: string;
  gen_ed?: string;
}): Promise<IOCourse[]> {
  const params = new URLSearchParams(parseOptions(options));
  const res = await fetch(`${API}/courses?${params}`);
  const json: unknown = await res.json();
  const parsed = courseSchema.array().parse(json);
  return parsed;
}

/** @see https://beta.umd.io/#operation/getCoursesById */
export async function getCoursesFromIO({
  course_ids,
  semester,
}: {
  course_ids: string[];
  semester: string;
}): Promise<IOCourse[]> {
  const params = new URLSearchParams({ semester });
  const res = await fetch(`${API}/courses/${course_ids.join(",")}?${params}`);
  const json: unknown = await res.json();
  const parsed = courseSchema.array().length(course_ids.length).parse(json);
  return parsed;
}

/** @see https://beta.umd.io/#operation/getCoursesById */
export async function getCourseFromIO({
  course_id,
  semester,
}: {
  course_id: string;
  semester: string;
}): Promise<IOCourse> {
  const params = new URLSearchParams({ semester });
  const res = await fetch(`${API}/courses/${course_id}?${params}`);
  const json: unknown = await res.json();
  const parsed = courseSchema.array().length(1).parse(json);
  return parsed.at(0)!;
}

/** @see https://beta.umd.io/#operation/getSections */
export async function getSectionsFromIO(options: {
  sort?: string;
  page?: number;
  per_page?: number;
  course_id: string;
  seats?: string;
  open_seats?: string;
  waitlist?: string;
  semester: string;
}): Promise<IOSection[]> {
  const params = new URLSearchParams(parseOptions(options));
  const res = await fetch(`${API}/courses/sections?${params}`); // use for just the umd.io api
  const json: unknown = await res.json();
  const parsed = sectionSchema.array().parse(json);
  return parsed;
}
