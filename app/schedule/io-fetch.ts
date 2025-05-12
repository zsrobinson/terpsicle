import { JSDOM } from "jsdom";
import { courseSchema, sectionSchema } from "./io-types";

const API = "https://api.umd.io/v1";
const SOC = "https://app.testudo.umd.edu";

/** @see https://beta.umd.io/#operation/getCourses */
export async function fetchCourses(options: {
  sort?: string;
  page?: number;
  per_page?: number;
  semester?: string;
  credits?: string;
  dept_id?: string;
  gen_ed?: string;
}) {
  const params = new URLSearchParams(parseOptions(options));
  const res = await fetch(`${API}/courses?${params}`);
  const json: unknown = await res.json();
  const parsed = courseSchema.array().parse(json);
  return parsed;
}

/** @see https://beta.umd.io/#operation/getSections */
export async function fetchSections(options: {
  sort?: string;
  page?: number;
  per_page?: number;
  course_id?: string;
  seats?: string;
  open_seats?: string;
  waitlist?: string;
  semester?: string;
}) {
  const params = new URLSearchParams(parseOptions(options));
  const res = await fetch(`${API}/courses/sections?${params}`);
  const json: unknown = await res.json();
  const parsed = sectionSchema.array().parse(json);
  return parsed;
}

/** expects one course_id */
export async function scrapeSections(
  options: { course_id: string; semester: string },
  dom: typeof JSDOM
) {
  const res = await fetch(
    `${SOC}/soc/${options.semester}/sections?courseIds=${options.course_id}`
  );
  const text = await res.text();
  const doc = new dom(text).window.document;
  // const doc = new DOMParser().parseFromString(text, "text/html");

  return [...doc.querySelectorAll(".section")].map((el) => {
    const number = el.querySelector(".section-id")!.innerHTML.trim();
    const instructors = [...el.querySelectorAll(".section-instructor")]
      .map((el) => el.querySelector("a") ?? el)
      .map((el) => el.innerHTML)
      .filter((str) => str !== "Instructor: TBA");
    const seats = el.querySelector(".total-seats-count")!.innerHTML;
    const open_seats = el.querySelector(".open-seats-count")!.innerHTML;
    const waitlist = el.querySelector(".waitlist-count")!.innerHTML;

    const meetings = [
      ...el.querySelectorAll(".class-days-container > .row"),
    ].map((mel) => {
      const days = mel.querySelector(".section-days")?.innerHTML ?? "";
      const room = mel.querySelector(".class-room")?.innerHTML ?? "";
      const building = mel.querySelector(".building-code")?.innerHTML ?? "";
      const classtype = mel.querySelector(".class-type")?.innerHTML ?? "";
      const start_time =
        mel.querySelector(".class-start-time")?.innerHTML ?? "";
      const end_time = mel.querySelector(".class-end-time")?.innerHTML ?? "";

      return { days, room, building, classtype, start_time, end_time };
    });

    return {
      course: options.course_id,
      section_id: options.course_id + "-" + number,
      semester: options.semester,
      number,
      seats,
      meetings,
      open_seats,
      waitlist,
      instructors,
    };
  });
}

function parseOptions(options: {
  [key: string]: string | number | undefined;
}): { [key: string]: string } {
  return Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .reduce((parsed, [key, value]) => {
      return { ...parsed, [key]: String(value) };
    }, {});
}
