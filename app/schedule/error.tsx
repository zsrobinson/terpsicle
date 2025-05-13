"use client";

import { Button } from "~/components/ui/button";

const SCHEDULE_LOCAL_STORAGE = [
  "added-sections",
  "semester-courses",
  "term",
  "current-schedule",
  "schedule-names",
] as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <main className="px-8 py-4">
      <div className="max-w-7xl mx-auto flex flex-col gap-4 items-start">
        <h2 className="font-semibold text-2xl">Something went wrong!</h2>
        <p>
          If reloading the page isn&apos;t working, try clearing your state.
          This will delete all of your saved schedules.
        </p>

        {error.message && <p>Error message: {error.message}</p>}

        <div className="flex gap-4">
          <Button
            onClick={() => {
              SCHEDULE_LOCAL_STORAGE.forEach((item) =>
                localStorage.removeItem(item)
              );
              reset();
            }}
            variant="outline"
          >
            Clear State
          </Button>
        </div>
      </div>
    </main>
  );
}
