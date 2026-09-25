// PROTOTYPE Variant 4 — "Pop over": details appear right next to the thing you clicked (a class on
// the calendar, a row in the sidebar), like an event in Google Calendar. Nothing else moves.
import { useStore } from "../store";
import { CloseButton, DetailView, Popover, Rail, TabPanel, TopBar } from "../ui";
import { PlanCalendar } from "./shared";

export function VariantPop() {
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
      </div>
      {s.detail && (
        <Popover anchor={s.anchor} onClose={() => d({ type: "close" })} width={s.detail.kind === "leg" ? 340 : 390}>
          <div className="absolute top-2 right-2 z-10"><CloseButton onClick={() => d({ type: "close" })} /></div>
          <DetailView compact />
        </Popover>
      )}
    </div>
  );
}
