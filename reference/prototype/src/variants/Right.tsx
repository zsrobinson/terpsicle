// PROTOTYPE Variant 3 — "Details on the right": the left sidebar is for your tools; a right panel
// appears only while you're looking at one specific thing, and goes away when you're done.
import { useStore } from "../store";
import { CloseButton, DetailView, Rail, TabPanel, TopBar } from "../ui";
import { PlanCalendar } from "./shared";

export function VariantRight() {
  const { s, d } = useStore();
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-border">
          <TabPanel />
        </aside>
        <PlanCalendar />
        {s.detail && (
          <aside key={JSON.stringify(s.detail)} className="slide-in-right flex w-[380px] shrink-0 flex-col border-l border-border">
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-2"><CloseButton onClick={() => d({ type: "close" })} /></div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto"><DetailView /></div>
          </aside>
        )}
      </div>
    </div>
  );
}
