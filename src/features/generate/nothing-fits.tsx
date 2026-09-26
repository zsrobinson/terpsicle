import { ArrowRight } from "lucide-react";
import { MessageText, messageToText } from "~/app/message-text";
import { ListRow, SectionHeader } from "~/app/panel";
import type { CatalogIndex } from "~/core/catalog";
import type {
  CourseCode,
  CourseColor,
  GenerateResult,
  NearMiss,
  Relaxation,
  SectionKey,
} from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { wildcardNote } from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";

// When nothing fits (SPEC §3.9): what loosening each must-have would unlock,
// and the closest plans with what stops them marked. Information, not an
// alarm: no red, no banner (DESIGN §5).

/** Conflict lines per closest plan; the rest are counted (UX-REVIEW §4.8). */
const CONFLICTS_SHOWN = 2;

export function NothingFits({
  result,
  index,
  colors,
  termName,
  onRelax,
}: {
  result: GenerateResult;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  termName: string;
  onRelax: (relaxation: Relaxation) => void;
}) {
  const { relaxations, nearMisses } = result;
  // A wildcard with nothing to pick from is usually the whole story.
  const notes = result.wildcards.flatMap((report) => {
    const note = wildcardNote(report, termName);
    return note ? [{ id: report.wildcard, note }] : [];
  });
  return (
    <div data-testid="nothing-fits">
      <SectionHeader variant="label" title="No plans" />
      {notes.map(({ id, note }) => (
        <p key={id} data-testid="wildcard-note" className="px-4 pb-2 text-base">
          {note}
        </p>
      ))}
      <p className="px-4 text-base">
        Nothing fits all of that.{" "}
        {relaxations.length > 0 ? (
          <span className="text-muted">Loosening one of these would help:</span>
        ) : (
          <span className="text-muted">
            Loosening one must-have isn't enough. Try removing a course, or
            fewer must-haves at once.
          </span>
        )}
      </p>
      {relaxations.length > 0 ? (
        <ul
          aria-label="Suggested changes"
          className="mt-2 flex flex-col gap-1 px-4"
        >
          {relaxations.map((r) => (
            <li key={`${r.constraint}:${r.label}`}>
              <WithTooltip label="Change this must-have and generate again">
                <button
                  type="button"
                  onClick={() => onRelax(r)}
                  className="flex w-full items-start gap-2 rounded-md border border-hairline bg-raised px-2.5 py-1.5 text-left text-base hover:bg-hover"
                >
                  {/* Wraps rather than truncates: the label is the choice. */}
                  <span className="min-w-0 flex-1 text-pretty">{r.label}</span>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-faint" />
                  <span className="tnum shrink-0 text-muted">
                    {r.unlockCount.toLocaleString()}
                    {r.atLeast ? "+" : ""}
                    {r.unlockCount === 1 && !r.atLeast ? " plan" : " plans"}
                  </span>
                </button>
              </WithTooltip>
            </li>
          ))}
        </ul>
      ) : null}
      {nearMisses.length > 0 ? (
        <>
          <SectionHeader className="mt-4" title="Closest plans" />
          <ul aria-label="Closest plans">
            {nearMisses.map((miss) => (
              <NearMissRow
                key={miss.sections.join(",")}
                miss={miss}
                index={index}
                colors={colors}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function NearMissRow({
  miss,
  index,
  colors,
}: {
  miss: NearMiss;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
}) {
  const marks = new Map<SectionKey, MiniWeekMark>();
  for (const c of miss.conflicts)
    for (const key of c.sectionKeys) marks.set(key, "conflict");
  const shown = miss.conflicts.slice(0, CONFLICTS_SHOWN);
  const more = miss.conflicts.length - shown.length;
  const all = miss.conflicts.map((c) => messageToText(c.message)).join("\n");
  return (
    <ListRow
      as="li"
      title={`${miss.sections.map((k) => k.replace("-", " ")).join(", ")}\n${all}`}
      lead={
        <div className="h-14 w-[76px]">
          <MiniWeek
            sections={miss.sections}
            index={index}
            colors={colors}
            marks={marks}
          />
        </div>
      }
    >
      <ul className="text-sm">
        {shown.map((c, i) => (
          <li
            key={`${c.kind}:${c.sectionKeys.join(",")}:${c.day ?? ""}`}
            className="flex min-w-0 items-baseline gap-1.5"
          >
            <span className="inline-block size-1.5 shrink-0 self-center rounded-full bg-warn" />
            <span className="min-w-0 truncate">
              <MessageText message={c.message} />
            </span>
            {more > 0 && i === shown.length - 1 ? (
              <span className="tnum shrink-0 text-faint">+{more} more</span>
            ) : null}
          </li>
        ))}
      </ul>
    </ListRow>
  );
}
