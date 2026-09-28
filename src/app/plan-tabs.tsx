import { cn } from "cn";
import { ChevronDown, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Plan, TermId } from "~/core/schema";
import { useActivePlanId, useTermPlans } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import {
  copyPlan,
  createEmptyPlan,
  deletePlan,
  openGenerate,
  openPlan,
  renamePlan,
} from "./actions";

// Plan tabs in the top bar (SPEC §2, §3.1): the open tab has a ▾ menu
// (Rename, Duplicate, Delete), double-click renames in place, tabs past
// `maxVisible` go into a menu, and `+` offers Empty / Copy / Generate.

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
 * at 1100px) or down to slivers (`squeezed`). Measured before paint; any
 * change of room or plans starts over from `max`.
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
    if (nav.scrollWidth > nav.clientWidth + 1 || squeezed(nav) >= 2)
      // Only if nothing started over in this same commit.
      setFit((now) => (now === fit ? fit - 1 : now));
  });
  return { ref, fit };
}

/**
 * Tabs pinned at their minimum (min-w-11, a thumb's width) with their names
 * cut off. One long name squeezed beside short ones is fine: its tooltip and
 * the menu have it whole. Two or more "Pl…" say nothing, so one goes in the
 * menu instead.
 */
function squeezed(nav: HTMLElement): number {
  return Array.from(
    nav.querySelectorAll<HTMLElement>("[data-plan-tab-name]"),
  ).filter(
    (name) =>
      name.scrollWidth > name.clientWidth + 1 &&
      (name.parentElement?.clientWidth ?? 0) <= 48,
  ).length;
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
              onOpen={() => openPlan(termId, plan.id)}
              onRename={(via) => setEditing({ id: plan.id, via })}
            />
          ),
        )}
      </ul>
      {overflow.length > 0 ? (
        <OverflowMenu
          plans={overflow}
          compact={room.fit <= 1}
          onOpen={(id) => openPlan(termId, id)}
        />
      ) : null}
      <NewPlanMenu termId={termId} current={active} />
    </nav>
  );
}

function PlanTab({
  plan,
  active,
  onOpen,
  onRename,
}: {
  plan: Plan;
  active: boolean;
  onOpen: () => void;
  onRename: (via: "menu" | "double-click") => void;
}) {
  const renaming = useRef(false);
  return (
    <li
      className={cn(
        "flex h-8 min-w-0 shrink items-center rounded-md transition-colors",
        // The kit's one selected fill (accent-soft), deeper than hover's.
        active ? "bg-accent-soft" : "hover:bg-hover/60",
      )}
    >
      <WithTooltip
        label={active ? "Double-click to rename" : `Open ${plan.name}`}
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={onOpen}
          onDoubleClick={() => onRename("double-click")}
          className={cn(
            // Never narrower than a thumb, however long the other tabs are.
            // The name truncates, not the button, whose touch area (styles.css)
            // reaches past its edges.
            "flex h-8 min-w-11 max-w-[160px] items-center rounded-md pl-2.5 text-base outline-offset-[-2px]",
            active ? "pr-1 font-medium" : "pr-2.5 text-muted hover:text-fg",
          )}
        >
          <span data-plan-tab-name className="truncate">
            {plan.name}
          </span>
        </button>
      </WithTooltip>
      {active ? (
        <DropdownMenu>
          <WithTooltip label="Plan options">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${plan.name} options`}
                className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg data-[state=open]:bg-raised data-[state=open]:text-fg"
              >
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </WithTooltip>
          <DropdownMenuContent
            onCloseAutoFocus={(event) => {
              // The rename field takes focus instead of the menu button.
              if (renaming.current) event.preventDefault();
              renaming.current = false;
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                renaming.current = true;
                onRename("menu");
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyPlan(plan.id)}>
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => deletePlan(plan.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

/** Inline rename: Enter or clicking away saves, Esc cancels. */
function RenameInput({
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
  compact,
  onOpen,
}: {
  plans: readonly Plan[];
  /** "+2" instead of "2 more" where only one tab fits (phones, a crowded bar). */
  compact: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <WithTooltip label="More plans">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${plans.length} more ${plans.length === 1 ? "plan" : "plans"}`}
            className="tnum flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            {compact ? `+${plans.length}` : `${plans.length} more`}
            <ChevronDown
              size={12}
              aria-hidden="true"
              className="max-[380px]:hidden"
            />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent>
        {plans.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onOpen(p.id)}>
            <span className="truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <DropdownMenu>
      <WithTooltip label="New plan">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="New plan"
            className="flex size-8 shrink-0 items-center max-[380px]:size-7 justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent
        className="w-[220px]"
        onCloseAutoFocus={(event) => {
          // Generate's course field takes focus instead of the + button,
          // once the menu has let go of it.
          if (generating.current) {
            event.preventDefault();
            useUi.getState().requestFocus("generate");
          }
          generating.current = false;
        }}
      >
        <DropdownMenuItem onSelect={() => createEmptyPlan(termId)}>
          <DropdownMenuItemText label="Empty plan" hint="No courses yet" />
        </DropdownMenuItem>
        {current ? (
          <DropdownMenuItem onSelect={() => copyPlan(current.id)}>
            <DropdownMenuItemText
              label={`Copy of ${current.name}`}
              hint="Try changes without losing this one"
            />
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            generating.current = true;
            openGenerate();
          }}
        >
          <DropdownMenuItemText
            label="Generate plans…"
            hint="From a list of courses"
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
