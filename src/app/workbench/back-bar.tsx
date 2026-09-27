import { cn } from "cn";
import { BackButton } from "~/ui/page-header";
import { WithTooltip } from "~/ui/tooltip";

/**
 * A drill-in's header in a workbench sidebar: "‹ Search   CMSC351". One
 * Back, to wherever you came from (the browser's Back does the same),
 * labeled with that view's short name, then this view's name. Going from
 * course to course never builds a trail to aim at.
 */
export function DrillBackBar({
  back,
  name,
  mono = false,
  onBack,
}: {
  /** Where Back goes: "Search", or a course code (`mono`). */
  back: { label: string; mono: boolean };
  /** This view's short name. */
  name: string;
  /** The name is a code ("CMSC351"). */
  mono?: boolean;
  onBack: () => void;
}) {
  // From one plan's CMSC351 back to another's: "Back", not "CMSC351".
  const same = back.label === name;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-hairline border-b px-4">
      <WithTooltip
        label={same ? "Back" : `Back to ${back.label}`}
        shortcut="Esc"
      >
        <BackButton onClick={onBack} className="min-w-0 max-w-[60%] shrink-0">
          {same ? (
            "Back"
          ) : (
            <>
              <span className="sr-only">Back to </span>
              <span className={cn("truncate", back.mono && "ident")}>
                {back.label}
              </span>
            </>
          )}
        </BackButton>
      </WithTooltip>
      <span
        aria-current="page"
        className={cn(
          "min-w-0 truncate font-medium text-base",
          mono && "ident",
        )}
      >
        {name}
      </span>
    </div>
  );
}
