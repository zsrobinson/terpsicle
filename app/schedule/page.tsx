"use client";

import { Course, Section } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Calendar } from "./calendar";
import { CourseList } from "./course-list";

export default function Page() {
  // prettier-ignore
  const [addedSections, setAddedSections] 
    = useLocalStorage<(Section & {course: Course})[]>("added-sections", []);

  return (
    <main className="flex gap-4 p-4 h-[calc(100vh-48px)] overflow-y-hidden">
      <CourseList
        addedSections={addedSections}
        setAddedSections={setAddedSections}
      />

      <Calendar
        addedSections={addedSections}
        setAddedSections={setAddedSections}
      />
    </main>
  );
}
