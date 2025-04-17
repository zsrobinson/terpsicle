"use client";

import { useState } from "react";
import { Input } from "~/components/ui/input";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Calendar } from "./calendar";
import { CourseList } from "./course-list";
import { AddedSection } from "./types";

export default function Page() {
  // prettier-ignore
  const [addedSections, setAddedSections] 
    = useLocalStorage<(AddedSection)[]>("added-sections", []);
  const [search, setSearch] = useState("");

  return (
    <main className="flex gap-4 p-4 h-[calc(100vh-48px)] overflow-y-hidden">
      <div className="flex flex-col w-sm gap-4">
        <div className="pr-4">
          <Input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value.toUpperCase().replace(" ", ""))
            }
            placeholder="Search (eg. MATH, CMSC4)"
            className="shrink-0 w-full z-20"
          />
        </div>

        <CourseList
          search={search}
          addedSections={addedSections}
          setAddedSections={setAddedSections}
        />
      </div>

      <Calendar
        setSearch={setSearch}
        addedSections={addedSections}
        setAddedSections={setAddedSections}
      />
    </main>
  );
}
