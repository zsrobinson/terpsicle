import type { CourseCode, CourseColor } from "~/core/schema";
import { CourseColorPicker } from "~/features/courses/color-picker";
import { Kbd } from "~/ui/kbd";
import { WithTooltip } from "~/ui/tooltip";
import type { GhostSummary, UntimedSection } from "./layout";
import { dotStyle, tintStyle } from "./tint";

// One-line strips above the grid. Nothing ever goes below it (SPEC §2).

/**
 * While a course's sections show as ghosts: what's happening and the keys,
 * in the prototype's words. The dot is the course's color picker.
 */
export function GhostHint({
  ghost,
  interactive,
  readOnly,
  color,
}: {
  ghost: GhostSummary;
  /** The course is open in the sidebar (not a search hover): ghosts can be clicked. */
  interactive: boolean;
  readOnly: boolean;
  color: CourseColor;
}) {
  return (
    <div className="flex h-[35px] shrink-0 items-center gap-2 border-hairline border-b bg-panel px-3 text-[12px]">
      {interactive && !readOnly ? (
        <CourseColorPicker courseCode={ghost.courseCode} color={color} />
      ) : (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={dotStyle(color)}
        />
      )}
      <span className="truncate">
        Showing every section of{" "}
        <span className="font-mono font-semibold">{ghost.courseCode}</span>.{" "}
        {interactive
          ? readOnly
            ? "Save a copy to change sections."
            : "Click one to switch."
          : "Open it to pick one."}
        {ghost.overflow > 0 ? (
          <span className="text-muted">
            {" "}
            {ghost.overflow} more with other times are in the list.
          </span>
        ) : null}
      </span>
      {interactive && !readOnly ? (
        <span className="ml-auto hidden shrink-0 items-center gap-1 text-muted sm:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> preview <Kbd>↵</Kbd> switch <Kbd>esc</Kbd> done
        </span>
      ) : null}
    </div>
  );
}

/** While a generated plan is previewed (SPEC §3.9), in the prototype's words. */
export function PreviewHint({
  label,
  planName,
}: {
  label: string;
  planName: string;
}) {
  return (
    <div className="flex h-[35px] shrink-0 items-center gap-2 border-hairline border-b bg-panel px-3 text-[12px]">
      <span className="truncate">
        <span className="font-medium">Previewing {label}.</span>{" "}
        <span className="text-muted">
          Outlined classes are changes from {planName}.
        </span>
      </span>
    </div>
  );
}

/** "No set time: ENGL393 0312 · online" (SPEC §3.3). */
export function UntimedStrip({
  sections,
  onOpen,
}: {
  sections: readonly UntimedSection[];
  onOpen: (courseCode: CourseCode) => void;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="flex min-h-[31px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-hairline border-b px-3 py-1 text-[11.5px] text-muted">
      <span>No set time:</span>
      {sections.map((s) => (
        <WithTooltip
          key={s.sectionKey}
          label={`See ${s.courseCode}'s sections`}
        >
          <button
            type="button"
            onClick={() => onOpen(s.courseCode)}
            className="rounded border px-1.5 py-0.5 font-medium font-mono"
            style={tintStyle(s.color)}
          >
            {s.courseCode} {s.sectionCode} ·{" "}
            <span className="font-sans font-normal">
              {s.delivery === "online-async" || s.delivery === "online-sync"
                ? "online"
                : "times TBA"}
            </span>
          </button>
        </WithTooltip>
      ))}
    </div>
  );
}
