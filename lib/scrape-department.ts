import { JSDOM } from "jsdom";
import { Course } from "./types";
const TERM = "202508";

export async function scrapeDepartment(dept: string) {
  const url = `https://app.testudo.umd.edu/soc/${TERM}/${dept}`;
  const res = await fetch(url);
  const text = await res.text();
  const doc = new JSDOM(text).window.document;

  const courses = doc.querySelectorAll("div.course");

  const courseList: Course[] = [];
  courses.forEach((courseDiv) => {
    // Extract course ID
    const courseIdDiv = courseDiv.querySelector("div.course-id");
    const courseID = courseIdDiv?.textContent?.trim() || "";

    // Extract course name
    const courseNameDiv = courseDiv.querySelector("span.course-title");
    const courseName = courseNameDiv?.textContent?.trim() || "";

    // Extract course credits
    const courseCreditsDiv =
      courseDiv.querySelector("span.course-max-credits") ||
      courseDiv.querySelector("span.course-min-credits");
    const courseCredits = parseFloat(
      courseCreditsDiv?.textContent?.trim() || "0"
    );

    // Extract GenEd codes
    const genEdGroupDiv = courseDiv.querySelector("div.gen-ed-codes-group");
    const genEds: string[][] = [];

    if (genEdGroupDiv) {
      // Find all GenEd subcategories
      const genEdSubcategories = genEdGroupDiv.querySelectorAll(
        "span.course-subcategory"
      );
      let currentGroup: string[] = [];

      genEdSubcategories.forEach((subcategory, index) => {
        const genEdCode = subcategory.textContent?.trim() || "";
        currentGroup.push(genEdCode);

        // Check for "or" separator or end of group
        if (
          subcategory.nextSibling?.textContent?.includes("or") === false ||
          index === genEdSubcategories.length - 1
        ) {
          genEds.push(currentGroup);
          currentGroup = [];
        }
      });
    }

    console.log(courseName, genEds);

    courseList.push({
      code: courseID,
      name: courseName,
      credits: courseCredits,
      geneds: genEds,
      semester: TERM,
    });
  });

  return courseList;
}
