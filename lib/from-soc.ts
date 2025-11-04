"use server";

import { JSDOM } from "jsdom";
import { IOSection } from "~/lib/types-io";
import { Term } from "./types";

const SOC = "https://app.testudo.umd.edu";

export async function getTermsFromSOC(): Promise<Term[]> {
  const res = await fetch(`${SOC}/soc/`);
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

  return [...doc.querySelectorAll("select#term-id-input > option")].map(
    (el) => ({
      value: (el as HTMLOptionElement).value,
      name: (el as HTMLOptionElement).textContent ?? "",
    })
  );
}

/** expects one course_id */
export async function getSectionsFromSOC(options: {
  course_id: string;
  semester: string;
}): Promise<IOSection[]> {
  const res = await fetch(
    `${SOC}/soc/${options.semester}/sections?courseIds=${options.course_id}`
  );
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

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
