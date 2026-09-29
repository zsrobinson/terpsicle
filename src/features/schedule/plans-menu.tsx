import { ChevronDown, Copy, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { termTagOf } from "~/core/catalog/term-tag";
import { shortTermName, termLabel } from "~/core/catalog/terms";
import { creditsLabel, planCredits } from "~/core/plans/credits";
import type { Plan, TermId } from "~/core/schema";
import {
  useActivePlanId,
  useActiveTerm,
  useHasDrafts,
  useMainPlan,
  useTermCatalog,
  useTermPlans,
  useTermTags,
} from "~/state/hooks";
import { useWorkspace } from "~/state/workspace-store";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
} from "~/ui/action-menu";
import { Skeleton } from "~/ui/skeleton";
import { MainPlanMark, TermTag } from "~/ui/term-tag";
import {
  copyPlan,
  createEmptyPlan,
  deletePlan,
  makeMainPlan,
  openGenerate,
  openPlan,
  renamePlan,
} from "./actions";
import { RenameInput } from "./plan-tabs";
import { TermItems } from "./term-switcher";

// The phone's term and plan (docs/decisions.md, "One bar at the top"): one
// control in the family bar, "Spring ’27 Next / Plan A", opening one sheet
// (the kit's ActionMenu) with the term's plans, New plan and Generate,
// what to do with the open plan (Rename, Duplicate, Make main plan,
// Delete), and the terms. A desktop keeps the term switcher and the plan
// tabs (./term-switcher, ./plan-tabs), which have the room.

export function PlansMenu({ termId }: { termId: TermId }) {
  const { term, terms } = useActiveTerm();
  const tags = useTermTags();
  const allPlans = useWorkspace((s) => s.plans);
  const mainPlans = useWorkspace((s) => s.mainPlans);
  const plans = useTermPlans(termId);
  const activeId = useActivePlanId(termId);
  const active = plans.find((p) => p.id === activeId);
  // No mark with one plan: there's nothing to choose between.
  const mainId = useMainPlan(termId)?.id;
  const marked = useHasDrafts(termId) ? mainId : undefined;
  const catalog = useTermCatalog(termId);
  const [renaming, setRenaming] = useState(false);
  // An item that sends focus somewhere else (the rename field, Generate's
  // course field): the sheet leaves it there as it closes.
  const sentFocus = useRef(false);

  if (!term || !terms) return <Skeleton className="h-4 w-32" />;
  if (renaming && active)
    return (
      <RenameInput
        plan={active}
        onDone={(name) => {
          if (name !== null) renamePlan(active.id, name, "menu");
          setRenaming(false);
        }}
      />
    );

  const words = (plan: Plan) => {
    const count = plan.courses.length;
    const courses =
      count === 0
        ? "No courses yet"
        : `${count} ${count === 1 ? "course" : "courses"}`;
    return catalog && count > 0
      ? `${courses} · ${creditsLabel(planCredits(plan, catalog.index))}`
      : courses;
  };

  return (
    <ActionMenu
      title="Plans"
      description={term.name}
      tooltip="Switch plan or term"
      finalFocus={() => {
        const sent = sentFocus.current;
        sentFocus.current = false;
        return sent ? false : null;
      }}
      trigger={
        // "Spring ’27 [Next] / Plan A ▾": the term and the open plan.
        <button
          type="button"
          // Named in full: "Spring 2027, Plan A".
          aria-label={`${term.name}, ${active?.name ?? "no plan yet"}`}
          className="flex h-9 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-base transition-colors hover:bg-hover data-popup-open:bg-hover"
        >
          {/* The term is the plan's parent: Secondary, as on a desktop's
              bar; the plan you're in is the Label (docs/DESIGN.md §7.8). */}
          <span className="emph-secondary whitespace-nowrap">
            {shortTermName(term.name)}
          </span>
          <TermTag tag={termTagOf(term.id, tags)} />
          <span aria-hidden="true" className="text-faint">
            /
          </span>
          {active && active.id === marked ? <MainPlanMark /> : null}
          <span className="emph-label min-w-0 truncate">
            {active?.name ?? "No plan yet"}
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-muted"
          />
        </button>
      }
    >
      <ActionMenuRadioGroup
        value={activeId ?? ""}
        onValueChange={(id) => openPlan(termId, id)}
      >
        {plans.map((p) => (
          <ActionMenuRadioItem
            key={p.id}
            value={p.id}
            hint={words(p)}
            icon={
              marked ? (
                <span className="flex size-4 items-center justify-center">
                  {p.id === marked ? <MainPlanMark /> : null}
                </span>
              ) : undefined
            }
          >
            {p.name}
            {p.id === marked ? (
              <span className="sr-only">, your main plan</span>
            ) : null}
          </ActionMenuRadioItem>
        ))}
      </ActionMenuRadioGroup>
      <ActionMenuSeparator />
      <ActionMenuItem
        icon={<Plus aria-hidden="true" />}
        onSelect={() => createEmptyPlan(termId)}
      >
        New plan
      </ActionMenuItem>
      <ActionMenuItem
        icon={<Layers aria-hidden="true" />}
        hint="From a list of courses"
        onSelect={() => {
          sentFocus.current = true;
          openGenerate();
        }}
      >
        Generate plans…
      </ActionMenuItem>
      {active ? (
        <>
          <ActionMenuSeparator />
          <ActionMenuItem
            icon={<Copy aria-hidden="true" />}
            onSelect={() => copyPlan(active.id)}
          >
            Duplicate {active.name}
          </ActionMenuItem>
          <ActionMenuItem
            icon={<Pencil aria-hidden="true" />}
            onSelect={() => {
              sentFocus.current = true;
              setRenaming(true);
            }}
          >
            Rename {active.name}
          </ActionMenuItem>
          {marked !== undefined && active.id !== marked ? (
            <ActionMenuItem
              icon={
                <span className="flex size-4 items-center justify-center">
                  <MainPlanMark />
                </span>
              }
              hint={`Chat, Plan, Todo and your calendar will use it for ${termLabel(active.termId)}.`}
              onSelect={() => makeMainPlan(active.id, "menu")}
            >
              Make main plan
            </ActionMenuItem>
          ) : null}
          <ActionMenuItem
            variant="destructive"
            icon={<Trash2 aria-hidden="true" />}
            onSelect={() => deletePlan(active.id)}
          >
            Delete {active.name}
          </ActionMenuItem>
        </>
      ) : null}
      <ActionMenuSeparator />
      <TermItems
        label="Term"
        termId={term.id}
        terms={terms}
        tags={tags}
        plans={allPlans}
        mainPlans={mainPlans}
      />
    </ActionMenu>
  );
}
