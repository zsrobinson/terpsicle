"use client";

import { AddedSection } from "~/lib/types-io";
import { Calendar } from "../schedule/calendar";

export function Preview({ addedSections }: { addedSections: AddedSection[] }) {
  return (
    <Calendar
      setSearch={() => {}}
      currentSchedule={{ name: "preview", term: "202601" }}
      addedSections={addedSections}
      setAddedSections={() => {}}
    />
  );
}
