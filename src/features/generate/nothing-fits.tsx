import { ArrowRight } from "lucide-react";
import { MessageText } from "~/app/message-text";
import { PanelLabel } from "~/app/panel";
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
import { MiniWeek, type MiniWeekMark } from "./mini-week";

// When nothing fits (SPEC §3.9): what loosening each must-have would unlock,
// and the closest plans with what stops them marked. Information, not an
// alarm: no red, no banner (DESIGN §5).

export function NothingFits({
  result,
  index,
  colors,
  onRelax,
}: {
  result: GenerateResult;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  onRelax: (relaxation: Relaxation) => void;
}) {
  const { relaxations, nearMisses } = result;
  return (
    <div data-testid="nothing-fits">
      <PanelLabel>No plans</PanelLabel>
      <p className="px-4 text-[12.5px]">
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
                  className="flex w-full items-center gap-2 rounded-md border border-hairline bg-raised px-2.5 py-1.5 text-left text-[12.5px] hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-faint" />
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
          <PanelLabel>Closest plans</PanelLabel>
          <ul aria-label="Closest plans" className="border-hairline border-t">
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
  return (
    <li className="flex gap-3 border-hairline border-b px-4 py-2.5">
      <div className="h-14 w-[76px] shrink-0">
        <MiniWeek
          sections={miss.sections}
          index={index}
          colors={colors}
          marks={marks}
        />
      </div>
      <div className="min-w-0 flex-1 text-[11.5px] leading-[1.45]">
        <div className="font-mono text-[11px] text-muted">
          {miss.sections.map((k) => k.replace("-", " ")).join(" · ")}
        </div>
        <ul className="mt-0.5">
          {miss.conflicts.map((c) => (
            <li key={`${c.kind}:${c.sectionKeys.join(",")}:${c.day ?? ""}`}>
              <span className="mr-1 inline-block size-1.5 rounded-full bg-warn align-middle" />
              <MessageText message={c.message} />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
