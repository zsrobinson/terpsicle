import { ChevronDown } from "lucide-react";
import { type TermTags, termTagOf } from "~/core/catalog/term-tag";
import { shortTermName } from "~/core/catalog/terms";
import { mainPlanFor, tabsInTerm } from "~/core/plans";
import type { MainPlans, Plan, Term } from "~/core/schema";
import { useActiveTerm, useTermTags } from "~/state/hooks";
import { useShare } from "~/state/share-store";
import { useWorkspace } from "~/state/workspace-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { MainPlanMark, TermTag } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";
import { switchTerm } from "./actions";

/**
 * `/ Spring 2027 [Next] ▾`: every term Testudo lists, then archived ones
 * under "Past terms" (SPEC §3.0). Now and Next are tagged (V2 §5.5), and
 * each row names its main plan, so you can see where you stand in every
 * term without opening it. Read-only while a shared plan is open, since the
 * link decides the term.
 */
export function TermSwitcher() {
  const { term, terms } = useActiveTerm();
  const sharing = useShare((s) => s.shared !== null);
  const tags = useTermTags();
  const plans = useWorkspace((s) => s.plans);
  const mainPlans = useWorkspace((s) => s.mainPlans);

  if (!terms || !term) return <Skeleton className="h-4 w-20" />;
  if (sharing)
    return (
      <span className="flex items-center gap-1.5 px-1.5 text-base text-muted">
        {term.name}
        <TermTag tag={termTagOf(term.id, tags)} />
      </span>
    );

  const active = terms.filter((t) => t.status === "active");
  const past = terms.filter((t) => t.status === "archived");
  const pick = (id: string) => {
    const next = terms.find((t) => t.id === id);
    if (next) switchTerm(next);
  };

  return (
    <DropdownMenu>
      <WithTooltip label="Switch term">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={term.name}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-base text-muted max-2xl:px-1 transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            {/* "Spring ’27" until the bar is wide (1536px, where the Early
                access chip comes back), so the tag and the plans' names fit. */}
            <span className="hidden 2xl:inline">{term.name}</span>
            <span aria-hidden="true" className="whitespace-nowrap 2xl:hidden">
              {shortTermName(term.name)}
            </span>
            <TermTag tag={termTagOf(term.id, tags)} />
            {/* Until 1536px a tagged term ends at its tag: the plan tabs need the room. */}
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={
                termTagOf(term.id, tags) ? "max-2xl:hidden" : undefined
              }
            />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="min-w-[240px]">
        <DropdownMenuRadioGroup value={term.id} onValueChange={pick}>
          {active.map((t) => (
            <TermItem
              key={t.id}
              term={t}
              tags={tags}
              plans={plans}
              mainPlans={mainPlans}
            />
          ))}
          {past.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Past terms</DropdownMenuLabel>
              {past.map((t) => (
                <TermItem
                  key={t.id}
                  term={t}
                  tags={tags}
                  plans={plans}
                  mainPlans={mainPlans}
                />
              ))}
            </>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Plan A, main · 3 plans", "Plan A · 5 courses" or "No plans yet". */
export function termPlansWords(
  plans: readonly Plan[],
  mainPlans: Readonly<MainPlans>,
  termId: string,
): { words: string; marked: boolean } {
  const tabs = tabsInTerm(plans, termId);
  const main = mainPlanFor(termId, plans, mainPlans);
  if (!main) return { words: "No plans yet", marked: false };
  if (tabs.length > 1)
    return { words: `${main.name}, main · ${tabs.length} plans`, marked: true };
  const placed = main.courses.filter((c) => c.sectionCode !== null).length;
  return {
    words: `${main.name} · ${placed} ${placed === 1 ? "course" : "courses"}`,
    marked: false,
  };
}

function TermItem({
  term,
  tags,
  plans,
  mainPlans,
}: {
  term: Term;
  tags: TermTags;
  plans: readonly Plan[];
  mainPlans: Readonly<MainPlans>;
}) {
  const archived = term.status === "archived";
  const { words, marked } = termPlansWords(plans, mainPlans, term.id);
  return (
    <DropdownMenuRadioItem value={term.id} className="items-start py-1.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={archived ? "text-muted" : undefined}>
            {term.name}
          </span>
          <TermTag tag={termTagOf(term.id, tags)} />
        </span>
        <span className="flex items-center gap-1.5 text-muted text-xs">
          {marked ? <MainPlanMark className="size-1.5" /> : null}
          {archived ? `Seats frozen · ${words}` : words}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}
