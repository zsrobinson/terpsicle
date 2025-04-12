import { scrapeDepartment } from "~/lib/scrape-department";
import { CourseList } from "./course-list";
import { Calendar } from "./calendar";
import { scrapeSections } from "~/lib/scrape-section";

export default async function Page() {
  const cmsc = await scrapeDepartment("CMSC");
  const sections = await scrapeSections("CMSC");

  return (
    <main className="flex gap-4">
      <CourseList courses={cmsc} sections={sections} />
      <Calendar />
    </main>
  );
}
