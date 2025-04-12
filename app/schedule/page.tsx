import { scrapeDepartment } from "~/lib/scrape-department";
import { CourseList } from "./course-list";
import { Calendar } from "./calendar";

export default async function Page() {
  const cmsc = await scrapeDepartment("CMSC");

  return (
    <main className="flex gap-4">
      <CourseList courses={cmsc} />
      <Calendar />
    </main>
  );
}
