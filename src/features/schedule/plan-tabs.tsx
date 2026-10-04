import { cn } from "cn";
import { ChevronDown, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import type { Plan, TermId } from "~/core/schema";
import {
  useActivePlanId,
  useHasDrafts,
  useMainPlan,
  useTermPlans,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuSeparator,
} from "~/ui/action-menu";
import { MainPlanMark } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";
import {
  copyPlan,
  createEmptyPlan,
  deletePlan,
  makeMainPlan,
  openGenerate,
  openPlan,
  renamePlan,
} from "./actions";

// Plan tabs in the top bar (SPEC §2, §3.1): the open tab has a ▾ menu
// (Rename, Duplicate, Make main plan, Delete), double-click renames in
// place, tabs past `maxVisible` go into a menu, and `+` offers Empty / Copy
// / Generate. With two or more plans, the main plan's tab carries a small
// red square (V2 §5.5); the others are drafts.

/** Which plans get a tab. The open plan always does, in its own place. */
export function splitTabs(
  plans: readonly Plan[],
  activeId: string | undefined,
  maxVisible: number,
): { visible: readonly Plan[]; overflow: readonly Plan[] } {
  if (plans.length <= maxVisible) return { visible: plans, overflow: [] };
  const room = Math.max(1, maxVisible);
  let visible = plans.slice(0, room);
  const active = plans.find((p) => p.id === activeId);
  if (active && !visible.includes(active))
    visible = [...visible.slice(0, room - 1), active];
  return { visible, overflow: plans.filter((p) => !visible.includes(p)) };
}

/**
 * How many tabs the bar has room for, from 1 to `max`: tabs shrink to a
 * thumb's width first, and only past that do they go into the overflow menu,
 * instead of running under the bar's status (QA2: "Plan A" over "4 credits"
 * at 1100px). Measured before paint; any change of room or plans starts over
 * from `max`.
 */
function useTabsThatFit(max: number, names: string, paused: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [fit, setFit] = useState(max);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setRoom(parent.clientWidth));
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: start over when the room, the plans or their names change
  useLayoutEffect(() => setFit(max), [max, names, room, paused]);
  useLayoutEffect(() => {
    const nav = ref.current;
    // Not while a tab is being renamed: its field is wider than the tab.
    if (!nav || paused || fit <= 1) return;
    if (nav.scrollWidth > nav.clientWidth + 1)
      // Only if nothing started over in this same commit.
      setFit((now) => (now === fit ? fit - 1 : now));
  });
  return { ref, fit };
}

export function PlanTabs({
  termId,
  maxVisible = 5,
}: {
  termId: TermId;
  maxVisible?: number;
}) {
  const plans = useTermPlans(termId);
  const activeId = useActivePlanId(termId);
  // No mark with one plan: there's nothing to choose between.
  const mainId = useMainPlan(termId)?.id;
  const marked = useHasDrafts(termId) ? mainId : undefined;
  const mainNote = useId();
  const [editing, setEditing] = useState<{
    id: string;
    via: "menu" | "double-click";
  } | null>(null);
  const room = useTabsThatFit(
    maxVisible,
    plans.map((p) => p.name).join("\n"),
    editing !== null,
  );
  const { visible, overflow } = splitTabs(plans, activeId, room.fit);
  const active = plans.find((p) => p.id === activeId);
  // Room for the open tab alone (a phone): the other plans go in its ▾
  // menu rather than a menu of their own, so its name keeps the room.
  const folded = room.fit <= 1 && overflow.length > 0;

  return (
    // A list of buttons, not an ARIA tablist: the open plan's ▾ menu button
    // sits beside its tab, and a tablist may hold nothing but tabs. The open
    // plan is `aria-current`.
    <nav
      ref={room.ref}
      aria-label="Plans"
      className="flex min-w-0 items-center gap-0.5"
    >
      <ul className="flex min-w-0 items-center gap-0.5">
        {visible.map((plan) =>
          editing?.id === plan.id ? (
            <li key={plan.id} className="flex">
              <RenameInput
                plan={plan}
                onDone={(name) => {
                  if (name !== null) renamePlan(plan.id, name, editing.via);
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <PlanTab
              key={plan.id}
              plan={plan}
              active={plan.id === activeId}
              main={plan.id === marked}
              mainNote={mainNote}
              drafts={marked !== undefined}
              others={folded ? overflow : []}
              mainId={marked}
              onOpen={() => openPlan(termId, plan.id)}
              onOpenOther={(id) => openPlan(termId, id)}
              onRename={(via) => setEditing({ id: plan.id, via })}
            />
          ),
        )}
      </ul>
      {overflow.length > 0 && !folded ? (
        <OverflowMenu
          plans={overflow}
          mainId={marked}
          onOpen={(id) => openPlan(termId, id)}
        />
      ) : null}
      <NewPlanMenu termId={termId} current={active} />
      {/* What the main plan's tab is, for its aria-describedby. */}
      <span id={mainNote} hidden>
        Your main plan
      </span>
    </nav>
  );
}

function PlanTab({
  plan,
  active,
  main,
  mainNote,
  drafts,
  others,
  mainId,
  onOpen,
  onOpenOther,
  onRename,
}: {
  plan: Plan;
  active: boolean;
  /** The id of the words that say it's the main plan. */
  mainNote: string;
  /** The open tab's ▾ menu lists these first, when there's no room for their tabs. */
  others: readonly Plan[];
  /** The marked main plan's id, for `others`. */
  mainId: string | undefined;
  onOpenOther: (id: string) => void;
  /** The term's main plan, with two or more plans (so it's marked). */
  main: boolean;
  /** The term has two or more plans: a draft's menu offers Make main plan. */
  drafts: boolean;
  onOpen: () => void;
  onRename: (via: "menu" | "double-click") => void;
}) {
  const renaming = useRef(false);
  const term = termLabel(plan.termId);
  return (
    <li
      className={cn(
        "flex h-8 min-w-0 shrink items-center rounded-md transition-colors",
        // The kit's one selected fill (accent-soft), deeper than hover's.
        active ? "bg-accent-soft" : "hover:bg-hover/60",
      )}
    >
      <WithTooltip
        label={
          main
            ? `Your main plan for ${term}: Chat, Plan, Todo and your calendar use it.${active ? " Double-click to rename." : ""}`
            : active
              ? "Double-click to rename"
              : `Open ${plan.name}`
        }
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          // Named for the plan alone; being main is its description.
          aria-describedby={main ? mainNote : undefined}
          onClick={onOpen}
          onDoubleClick={() => onRename("double-click")}
          className={cn(
            // Never narrower than a thumb, however long the other tabs are.
            // The name truncates, not the button, whose touch area (styles.css)
            // reaches past its edges.
            "flex h-8 min-w-11 max-w-[160px] items-center gap-1 rounded-md text-base outline-offset-[-2px]",
            // The mark starts the main plan's tab, so it takes a little less room before it.
            main ? "pl-2" : "pl-2.5 max-sm:pl-2",
            active
              ? "pr-1 font-medium max-sm:pr-0"
              : "pr-2.5 text-muted hover:text-fg",
          )}
        >
          {main ? <MainPlanMark /> : null}
          <span className="truncate">{plan.name}</span>
        </button>
      </WithTooltip>
      {active ? (
        <ActionMenu
          title={plan.name}
          tooltip={
            others.length > 0 ? "Other plans and options" : "Plan options"
          }
          className="max-w-[300px]"
          // The rename field takes focus instead of the menu button.
          finalFocus={() => {
            const sent = renaming.current;
            renaming.current = false;
            return sent ? false : null;
          }}
          trigger={
            <button
              type="button"
              aria-label={`${plan.name} options`}
              className="mr-1 flex size-6 shrink-0 max-sm:mr-0.5 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg data-popup-open:bg-raised data-popup-open:text-fg"
            >
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          }
        >
          {others.length > 0 ? (
            <>
              {others.map((p) => (
                <ActionMenuItem
                  key={p.id}
                  icon={p.id === mainId ? <MainPlanMark /> : undefined}
                  onSelect={() => onOpenOther(p.id)}
                >
                  Open {p.name}
                  {p.id === mainId ? (
                    <span className="sr-only">, your main plan</span>
                  ) : null}
                </ActionMenuItem>
              ))}
              <ActionMenuSeparator />
            </>
          ) : null}
          <ActionMenuItem
            onSelect={() => {
              renaming.current = true;
              onRename("menu");
            }}
          >
            Rename
          </ActionMenuItem>
          <ActionMenuItem onSelect={() => copyPlan(plan.id)}>
            Duplicate
          </ActionMenuItem>
          {drafts && !main ? (
            <ActionMenuItem
              icon={<MainPlanMark />}
              hint={`Chat, Plan, Todo and your calendar will use ${plan.name} for ${term}.`}
              onSelect={() => makeMainPlan(plan.id, "menu")}
            >
              Make main plan
            </ActionMenuItem>
          ) : null}
          <ActionMenuItem
            variant="destructive"
            onSelect={() => deletePlan(plan.id)}
          >
            Delete
          </ActionMenuItem>
        </ActionMenu>
      ) : null}
    </li>
  );
}

/** Inline rename: Enter or clicking away saves, Esc cancels. */
export function RenameInput({
  plan,
  onDone,
}: {
  plan: Plan;
  onDone: (name: string | null) => void;
}) {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <WithTooltip label="Enter to save, Esc to cancel">
      <input
        // biome-ignore lint/a11y/noAutofocus: it appears because the person asked to rename
        autoFocus
        aria-label="Plan name"
        defaultValue={plan.name}
        maxLength={60}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(event.currentTarget.value);
          } else if (event.key === "Escape") {
            // Handled here, so the shell's Esc (drill back) skips it.
            event.preventDefault();
            finish(null);
          }
        }}
        className="h-8 w-32 rounded-md border border-hairline-strong bg-raised px-2 text-base outline-none focus-visible:outline-none"
      />
    </WithTooltip>
  );
}

function OverflowMenu({
  plans,
  mainId,
  onOpen,
}: {
  plans: readonly Plan[];
  /** The marked main plan, when it's one of these. */
  mainId: string | undefined;
  onOpen: (id: string) => void;
}) {
  return (
    <ActionMenu
      title="More plans"
      tooltip="More plans"
      trigger={
        <button
          type="button"
          aria-label={`${plans.length} more ${plans.length === 1 ? "plan" : "plans"}`}
          className="tnum flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg"
        >
          {plans.length} more
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      }
    >
      {plans.map((p) => (
        <ActionMenuItem
          key={p.id}
          icon={p.id === mainId ? <MainPlanMark /> : undefined}
          onSelect={() => onOpen(p.id)}
        >
          {p.name}
          {p.id === mainId ? (
            <span className="sr-only">, your main plan</span>
          ) : null}
        </ActionMenuItem>
      ))}
    </ActionMenu>
  );
}

function NewPlanMenu({
  termId,
  current,
}: {
  termId: TermId;
  current: Plan | undefined;
}) {
  const generating = useRef(false);
  return (
    <ActionMenu
      title="New plan"
      tooltip="New plan"
      className="w-[220px]"
      // Generate's course field takes focus instead of the + button, once
      // the menu has let go of it.
      finalFocus={() => {
        const sent = generating.current;
        generating.current = false;
        if (!sent) return null;
        useUi.getState().requestFocus("generate");
        return false;
      }}
      trigger={
        <button
          type="button"
          aria-label="New plan"
          className="flex size-8 shrink-0 items-center max-[380px]:size-7 justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      }
    >
      <ActionMenuItem
        hint="No courses yet"
        onSelect={() => createEmptyPlan(termId)}
      >
        Empty plan
      </ActionMenuItem>
      {current ? (
        <ActionMenuItem
          hint="Try changes without losing this one"
          onSelect={() => copyPlan(current.id)}
        >
          Copy of {current.name}
        </ActionMenuItem>
      ) : null}
      <ActionMenuItem
        hint="From a list of courses"
        onSelect={() => {
          generating.current = true;
          openGenerate();
        }}
      >
        Generate plans…
      </ActionMenuItem>
    </ActionMenu>
  );
}
