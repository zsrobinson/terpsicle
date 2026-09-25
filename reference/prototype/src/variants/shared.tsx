// PROTOTYPE: calendar wiring shared by all variants.
import { useStore } from "../store";
import { Calendar, rectOf } from "../ui";

export function PlanCalendar() {
  const { s, d } = useStore();
  return (
    <main className="scroll-thin min-w-0 flex-1 overflow-auto">
      <Calendar
        onItem={(i, el) => i.course && (s.detail?.kind === "course" && s.detail.code === i.course.code ? d({ type: "close" }) : d({ type: "open", detail: { kind: "course", code: i.course.code }, anchor: rectOf(el) }))}
        onLeg={(l, el) => d({ type: "open", detail: { kind: "leg", key: l.key }, anchor: rectOf(el) })}
      />
    </main>
  );
}
