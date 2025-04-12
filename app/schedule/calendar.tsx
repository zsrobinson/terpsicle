"use client";

import { Fragment } from "react";

export function Calendar() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const times = ["10am", "11am", "12pm", "1pm", "2pm", "3pm"];

  // const [courses, setCourses] = useLocalStorage<Course[]>("courses", []);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="ml-12 flex justify-around">
        {days.map((day) => (
          <div key={day} className="flex flex-col gap-2">
            <span className="font-semibold">{day}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-10 w-full">
        {times.map((time) => (
          <Fragment key={time}>
            <div className="flex w-full items-center gap-2">
              <span className="leading-none text-muted-foreground text-xs w-10 text-right">
                {time}
              </span>
              <hr className="w-full" />
            </div>

            <div className="flex w-full items-center gap-2">
              <hr className="w-full border-dotted ml-12" />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
