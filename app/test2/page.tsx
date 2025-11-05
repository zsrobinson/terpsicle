"use client";

import { generate } from "~/lib/generate";
import { Preview } from "./preview";
import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

export default function Page() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof generate>>>();

  return (
    <div className="p-8 flex flex-col gap-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const required = formData.get("required");
          if (typeof required !== "string") return;
          const newResult = await generate(required.split(", "));
          setResult(newResult);
        }}
        className="flex gap-4 max-w-120"
      >
        <Input name="required" type="text" placeholder="Required Courses" />
        <Button type="submit">Submit</Button>
      </form>

      {result && (
        <>
          <p>
            <strong>{result.length}</strong> total schedules
          </p>
          <div className="grid grid-cols-2 gap-4">
            {result.schedules.map((schedule, i) => (
              <div key={i} className="pb-4 h-120 border rounded-2xl p-4">
                <p>
                  <strong>Result {i + 1}:</strong>{" "}
                  {schedule.map((sec) => sec.section_id).join(", ")}
                </p>
                <Preview
                  addedSections={schedule.map((sec) => ({
                    id: sec.section_id,
                    term: result.courses.at(0)!.semester,
                    scheduleName: "preview",
                    cachedCourse: result.courses.find(
                      (course) => course.course_id === sec.course
                    )!,
                    cachedSection: sec,
                  }))}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
