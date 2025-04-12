"use client";

import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Course } from "~/lib/types";

export function CourseList({ courses }: { courses: Course[] }) {
  const [search, setSearch] = useState("");
  const filtered = courses.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.map((course, i) => (
        <CourseCard course={course} key={i} />
      ))}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <div className="border rounded-lg py-1 px-2 max-w-sm">
      <p className="font-semibold leading-none pb-1">{course.code}</p>
      <p className="leading-none text-balance">{course.name}</p>
    </div>
  );
}
