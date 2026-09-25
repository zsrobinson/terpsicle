// PROTOTYPE Variant 2 — "Side by side": still everything on the left, but details open in a second
// column next to the list you came from, so the list never disappears.
import { useStore } from "../store";
import { CloseButton, DetailView, Rail, TabPanel, TopBar } from "../ui";
import { PlanCalendar } from "./shared";

export function VariantSide() {
  const { s, d } = useStore();
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-border">
          <TabPanel />
        </aside>
        {s.detail && (
          <aside key={JSON.stringify(s.detail)} className="slide-in flex w-[370px] shrink-0 flex-col border-r border-border bg-panel/40">
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-2"><CloseButton onClick={() => d({ type: "close" })} /></div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto"><DetailView /></div>
          </aside>
        )}
        <PlanCalendar />
      </div>
    </div>
  );
}
