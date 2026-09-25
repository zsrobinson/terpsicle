import type { CourseCode, CourseColor } from "~/core/schema";
import { CourseColorPicker } from "~/features/courses/color-picker";
import { Kbd } from "~/ui/kbd";
import { WithTooltip } from "~/ui/tooltip";
import type { GhostSummary, UntimedSection } from "./layout";
import { dotStyle, tintStyle } from "./tint";

// One-line strips above the grid. Nothing ever goes below it (SPEC §2).
// The ghost and preview hints lay over the day names (`WeekFrame` overlay),
// so they never push the grid down as the pointer moves.

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
  // A course with nothing to pick from (one section, already placed, or none
  // listed) gets no "click one to switch" and no keys that do nothing.
  const others = ghost.sectionCount - (ghost.placedCode ? 1 : 0);
  const choosing = interactive && !readOnly && others > 0;
  return (
    <div className="@container flex h-full items-center gap-2 border-hairline border-b bg-panel px-3 text-sm">
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
        {ghost.sectionCount === 0 ? (
          <>
            <span className="ident font-semibold">{ghost.courseCode}</span> has
            no sections listed this term.
          </>
        ) : others === 0 ? (
          <>
            <span className="ident font-semibold">{ghost.courseCode}</span> has
            no other sections.
          </>
        ) : ghost.sectionCount === 1 ? (
          <>
            Showing{" "}
            <span className="ident font-semibold">{ghost.courseCode}</span>
            's only section.{" "}
            {interactive
              ? readOnly
                ? "Save a copy to add it."
                : "Click it to add it."
              : "Open it to add it."}
          </>
        ) : (
          <>
            Showing every section of{" "}
            <span className="ident font-semibold">{ghost.courseCode}</span>.{" "}
            {interactive
              ? readOnly
                ? "Save a copy to change sections."
                : "Click one to switch."
              : "Open it to pick one."}
          </>
        )}
        {ghost.overflow > 0 ? (
          <span className="text-muted">
            {" "}
            {ghost.overflow} more with other times are in the list.
          </span>
        ) : null}
      </span>
      {choosing ? (
        <span className="ml-auto hidden shrink-0 items-center gap-1 text-muted @2xl:flex">
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
    <div className="@container flex h-full items-center gap-2 border-hairline border-b bg-panel px-3 text-sm">
      <span className="truncate">
        <span className="font-medium">Previewing {label}.</span>{" "}
        <span className="text-muted">
          Outlined classes are changes from {planName}.
        </span>
      </span>
    </div>
  );
}

/** Matches course details' "Contact the department for times". */
const UNTIMED_WORDS: Record<UntimedSection["reason"], string> = {
  "contact-department": "contact the department",
  online: "online",
  "times-tba": "times TBA",
};

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
    <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-hairline border-b px-3 py-1 text-muted text-sm">
      <span>No set time:</span>
      {sections.map((s) => (
        <WithTooltip
          key={s.sectionKey}
          label={`See ${s.courseCode}'s sections`}
        >
          <button
            type="button"
            onClick={() => onOpen(s.courseCode)}
            className="rounded border px-1.5 py-0.5 ident font-medium"
            style={tintStyle(s.color)}
          >
            {s.courseCode} {s.sectionCode} ·{" "}
            <span className="font-sans font-normal">
              {UNTIMED_WORDS[s.reason]}
            </span>
          </button>
        </WithTooltip>
      ))}
    </div>
  );
}
