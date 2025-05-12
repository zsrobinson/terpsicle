"use client";

import { useQuery } from "@tanstack/react-query";
import { Edit3Icon, SendIcon, SlashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Term } from "~/lib/types";
import { useLocalStorage } from "~/lib/use-local-storage";
import { Calendar } from "./calendar";
import { CourseList } from "./course-list";
import { AddedSection } from "./types";

export default function Page() {
  // prettier-ignore
  const [addedSections, setAddedSections] 
    = useLocalStorage<(AddedSection)[]>("added-sections", []);
  // const [, setStoredCourses] = useLocalStorage<{
  //   [semesterId: string]: Course[];
  // }>("semester-courses", {});
  const [search, setSearch] = useState("");
  const [term, setTerm] = useLocalStorage<string | undefined>(
    "term",
    undefined
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsQuery.data]);

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
          />
        </div>

        <CourseList
          term={term}
          search={search}
          addedSections={addedSections}
          setAddedSections={setAddedSections}
        />
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

            <Select defaultValue="default">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Schedule</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline">
              <Edit3Icon />
            </Button>
          </div>

          <Button variant="outline">
            Add to Plan <SendIcon />
          </Button>
        </div>

        <Calendar
          setSearch={setSearch}
          addedSections={addedSections}
          setAddedSections={setAddedSections}
        />
      </div>
    </main>
  );
}
