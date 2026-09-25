// PROTOTYPE Variant 1 — "Drill in": only a left sidebar. Opening a course or connection pushes it
// on top of the current tab, with a Back button that returns you to exactly where you were.
import { useStore } from "../store";
import { BackButton, DetailView, Rail, TABS, TabPanel, TopBar } from "../ui";
import { PlanCalendar } from "./shared";

export function VariantDrill() {
  const { s, d } = useStore();
  const from = TABS.find((t) => t.id === s.tab)!.label;
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-border">
          {s.detail ? (
            <div key={JSON.stringify(s.detail)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0 items-center border-b border-border px-2"><BackButton label={from} onClick={() => d({ type: "close" })} /></div>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto"><DetailView /></div>
            </div>
          ) : <TabPanel />}
        </aside>
        <PlanCalendar />
      </div>
    </div>
  );
}
