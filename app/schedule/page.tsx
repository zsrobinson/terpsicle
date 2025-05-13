"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  CopyIcon,
  Edit3Icon,
  PlusIcon,
  SendIcon,
  SlashIcon,
  TrashIcon,
} from "lucide-react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Tooltip } from "~/components/ui/better-tooltip";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Course, Term } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Calendar } from "./calendar";
import { CourseList } from "./course-list";
import { AddedSection, Schedule } from "./io-types";

export default function Page() {
  // prettier-ignore
  const [addedSections, setAddedSections] 
    = useLocalStorage<(AddedSection)[]>("added-sections", []);
  const [, setStoredCourses] = useLocalStorage<{
    [semesterId: string]: Course[];
  }>("semester-courses", {});
  const [search, setSearch] = useState("");
  const [term, setTerm] = useLocalStorage<string | undefined>(
    "term",
    undefined
  );
  const [currentSchedule, setCurrentSchedule] = useLocalStorage<
    Schedule | undefined
  >("current-schedule", undefined);
  const [schedules, setSchedules] = useLocalStorage<Schedule[]>(
    "schedule-names",
    []
  );
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleNameInput, setScheduleNameInput] = useState("");

  const termsQuery = useQuery({
    queryKey: ["terms"],
    queryFn: async () => {
      const res = await fetch("/api/terms");
      const json = (await res.json()) as Term[];
      return json;
    },
  });

  // if there's no term, set it to the latest fall/spring semester
  useEffect(() => {
    if (term) return;
    if (!termsQuery.data) return;
    const latestLongSemester =
      termsQuery.data
        .filter(({ name }) => name.includes("Fall") || name.includes("Spring"))
        .at(-1) ?? undefined;
    if (latestLongSemester) setTerm(latestLongSemester.value);
  }, [setTerm, term, termsQuery.data]);

  // if there's no schedules for a term, make a default one
  useEffect(() => {
    if (!termsQuery.data) return;
    setSchedules((prev) => {
      const toAdd: Schedule[] = [];
      for (const term of termsQuery.data) {
        if (!prev.find((sch) => sch.term === term.value)) {
          console.log("doing it for ", term.value);
          toAdd.push({ term: term.value, name: "Schedule 1" });
        }
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, [setSchedules, termsQuery.data]);

  // when term changes, set schedule to the first one
  useEffect(() => {
    if (!term) return;
    setCurrentSchedule(schedules.filter((sch) => sch.term === term).at(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const onlineAsyncSections = addedSections.filter(
    (section) =>
      section.term === term &&
      section.scheduleName === currentSchedule?.name &&
      section.cachedSection.meetings.some((m) => !m.start_time || !m.end_time)
  );

  return (
    <main className="flex gap-4 p-4 h-[calc(100vh-48px)] overflow-y-hidden divide-x">
      <div className="flex flex-col w-sm gap-4">
        <div className="pr-4 flex gap-4 w-full">
          <Input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value.toUpperCase().replace(" ", ""))
            }
            disabled={term === undefined}
            placeholder="Search (eg. MATH, CMSC4)"
            className="z-20"
            autoFocus
          />
        </div>

        {term && currentSchedule && (
          <CourseList
            term={term}
            currentSchedule={currentSchedule}
            search={search}
            addedSections={addedSections}
            setAddedSections={setAddedSections}
          />
        )}
      </div>

      <div className="w-full h-full flex flex-col gap-4">
        <div className="flex gap-2 items-center justify-between">
          <div className="flex gap-2 items-center">
            <Select
              defaultValue=""
              value={term}
              onValueChange={(value) => setTerm(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a term" />
              </SelectTrigger>
              <SelectContent>
                {termsQuery.data?.map(({ value, name }) => (
                  <SelectItem key={value} value={value}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SlashIcon className="text-border -rotate-12" />

            {currentSchedule &&
              (editingSchedule ? (
                <form className="flex gap-2">
                  <Input
                    value={scheduleNameInput}
                    placeholder={currentSchedule.name}
                    onChange={(e) => setScheduleNameInput(e.target.value)}
                    className="w-[180px]"
                    autoFocus
                  />

                  <Tooltip text="Save Changes">
                    <Button
                      variant="outline"
                      size="icon"
                      key="save-changes-button"
                      type="submit"
                      onClick={() => {
                        const newSch = { term: term!, name: scheduleNameInput };
                        setEditingSchedule(false);
                        setCurrentSchedule(newSch);
                        setSchedules((prev) =>
                          prev.map((sch) => {
                            return sch.name === currentSchedule.name &&
                              sch.term === currentSchedule.term
                              ? newSch
                              : sch;
                          })
                        );
                        setAddedSections((prev) =>
                          prev.map((sec) =>
                            sec.scheduleName === currentSchedule.name
                              ? { ...sec, scheduleName: scheduleNameInput }
                              : sec
                          )
                        );
                      }}
                      disabled={
                        schedules.find(
                          (sch) =>
                            sch.term === term! &&
                            sch.name === scheduleNameInput &&
                            sch.name !== currentSchedule.name
                        ) !== undefined || scheduleNameInput === ""
                      }
                    >
                      <CheckIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip text="Delete Schedule">
                    <Button
                      key="delete-schedule-button"
                      size="icon"
                      variant="destructive"
                      onClick={() => {
                        // remove the schedule itself from our list
                        setSchedules((prev) => {
                          // prettier-ignore
                          const new_schedules = prev.filter(
                            (sch) => !(sch.name === currentSchedule.name &&
                              sch.term === currentSchedule.term));

                          // set the current schedule to be the new first one
                          // prettier-ignore
                          setCurrentSchedule(new_schedules
                            .filter((sch) => sch.term === term)
                            .at(0));

                          return new_schedules;
                        });

                        // remove the sections associated with the schedule
                        // prettier-ignore
                        setAddedSections((prev) => prev.filter(
                          (sec) => !(sec.scheduleName === currentSchedule.name 
                          && sec.term === currentSchedule.term)
                        ));

                        // return back to normal state
                        setEditingSchedule(false);
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  </Tooltip>
                </form>
              ) : (
                <div className="flex gap-2 items-center">
                  <Select
                    value={currentSchedule.name}
                    onValueChange={(value) =>
                      setCurrentSchedule(
                        schedules.find(
                          (sch) => sch.term === term && sch.name === value
                        )
                      )
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedules
                        .filter((sch) => sch.term === term)
                        .map((sch) => (
                          <SelectItem value={sch.name} key={sch.name}>
                            {sch.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Tooltip text="Edit Schedule">
                    <Button
                      size="icon"
                      variant="outline"
                      key="edit-schedule-button"
                      onClick={() => {
                        setEditingSchedule(true);
                        setScheduleNameInput(currentSchedule.name ?? "");
                      }}
                    >
                      <Edit3Icon />
                    </Button>
                  </Tooltip>

                  <Tooltip text="New Schedule">
                    <Button
                      size="icon"
                      variant="outline"
                      key="new-schedule-button"
                      onClick={() => {
                        let num =
                          schedules.filter((s) => s.term === term).length + 1;

                        // make sure there's no funny business
                        while (
                          schedules.find((s) => s.name === "Schedule " + num)
                        ) {
                          num++;
                        }

                        const sch = { term: term!, name: "Schedule " + num };
                        setSchedules((prev) => [...prev, sch]);
                        setCurrentSchedule(sch);
                      }}
                      disabled={!term}
                    >
                      <PlusIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip text="Copy Schedule">
                    <Button
                      size="icon"
                      variant="outline"
                      key="copy-schedule-button"
                      onClick={() => {
                        let num =
                          schedules.filter((s) => s.term === term).length + 1;

                        // make sure there's no funny business
                        while (
                          schedules.find((s) => s.name === "Schedule " + num)
                        ) {
                          num++;
                        }

                        const sch = { term: term!, name: "Schedule " + num };

                        setAddedSections((prev) => [
                          ...prev,
                          ...prev
                            .filter(
                              (section) =>
                                section.scheduleName === currentSchedule.name &&
                                section.term === currentSchedule.term
                            )
                            .map((section) => ({
                              ...section,
                              scheduleName: sch.name,
                            })),
                        ]);

                        setSchedules((prev) => [...prev, sch]);
                        setCurrentSchedule(sch);
                      }}
                      disabled={!term}
                    >
                      <CopyIcon />
                    </Button>
                  </Tooltip>

                  <div>
                    <p className="text-muted-foreground text-sm pl-2 leading-tight">
                      <span className="font-semibold">Total Credits: </span>
                      {addedSections
                        .filter(
                          (section) =>
                            section.term === term &&
                            section.scheduleName === currentSchedule.name
                        )
                        .reduce(
                          (acc, section) =>
                            acc + (Number(section.cachedCourse.credits) || 0),
                          0
                        )}
                    </p>

                    {onlineAsyncSections.length > 0 && (
                      <p className="text-muted-foreground text-sm pl-2 leading-tight">
                        <span className="font-semibold">Online Async: </span>
                        {onlineAsyncSections.map((sec, i) => (
                          <button
                            key={i}
                            className="leading-none cursor-pointer whitespace-pre"
                            onClick={() =>
                              setSearch(sec.cachedCourse.course_id)
                            }
                          >
                            {sec.cachedCourse.course_id}
                            {i < onlineAsyncSections.length - 1 && ", "}
                          </button>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setStoredCourses((prev) => {
                if (!term || !currentSchedule) return prev;
                // Convert each AddedSection to Course.
                const coursesForTerm: Course[] = addedSections
                  .filter(
                    (section) =>
                      section.term === currentSchedule.term &&
                      section.scheduleName === currentSchedule.name
                  )
                  .map((section) => ({
                    code: section.cachedCourse.course_id,
                    name: section.cachedCourse.name,
                    credits: section.cachedCourse.credits,
                    semester: currentSchedule.term,
                    // WARNING: this does not correctly account for "or" gen-eds, but umd.io doesn't seem to parse them properly
                    geneds: section.cachedCourse.gen_ed
                      .flat()
                      .map((str) => [str]),
                  }));
                return {
                  ...prev,
                  [term]: coursesForTerm,
                };
              });
              redirect(`/degree#${term}`);
            }}
            disabled={!term || !currentSchedule}
          >
            Add to Plan <SendIcon />
          </Button>
        </div>

        {currentSchedule && (
          <Calendar
            setSearch={setSearch}
            currentSchedule={currentSchedule}
            addedSections={addedSections}
            setAddedSections={setAddedSections}
          />
        )}
      </div>
    </main>
  );
}
