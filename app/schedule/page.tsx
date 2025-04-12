"use client";

import { useQuery } from "@tanstack/react-query";
import { deserialize } from "superjson";
import { Course, Section } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Calendar } from "./calendar";
import { CourseList } from "./course-list";

export default function Page() {
  // const cmsc = await scrapeDepartment("CMSC");
  // const sections = await scrapeSections("CMSC");

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const res = await fetch("/api/courses?dept=CMSC");
      const json = await res.json();
      return json as Course[];
    },
    initialData: [],
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const res = await fetch("/api/sections?dept=CMSC");
      const json = await res.json();
      return deserialize(json) as Section[];
    },
    initialData: [],
  });

  // prettier-ignore
  const [addedSections, setAddedSections] 
    = useLocalStorage<string[]>("added-sections", []);

  if (coursesQuery.isLoading || sectionsQuery.isLoading) {
    return <p>loading</p>;
  }

  return (
    <main className="flex gap-4">
      <CourseList
        courses={coursesQuery.data}
        sections={sectionsQuery.data}
        addedSections={addedSections}
        setAddedSections={setAddedSections}
      />
      <Calendar
        courses={coursesQuery.data}
        sections={sectionsQuery.data}
        addedSections={addedSections}
        setAddedSections={setAddedSections}
      />
    </main>
  );
}
