import { scrapeDepartment } from "~/lib/scrape-department";
import { CourseList } from "./course-list";

export default async function Page() {
  const cmsc = await scrapeDepartment("CMSC");

  return (
    <main className="flex flex-col gap-4 items-start">
      <CourseList courses={cmsc} />
    </main>
  );
}
