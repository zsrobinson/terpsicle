import { useLocation } from "@tanstack/react-router";
import { cn } from "cn";
import { Check, ChevronDown, Redo2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { AppBar } from "~/app/app-bar";
import { modKey } from "~/app/shortcuts";
import { CreditsStatus, ProblemsStatus } from "~/app/workbench/status";
import { creditsHeadline } from "~/core/four-year/credits";
import { firstTermChoices, fourYearTermLabel } from "~/core/four-year/terms";
import { canRedo, canUndo } from "~/core/plans/history";
import type { FourYearDoc } from "~/core/schema/four-year";
import { useSyncStatus } from "~/features/sync/status";
import { SyncStatusLabel } from "~/features/sync/status-view";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Input } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import {
  deleteDoc,
  duplicateDoc,
  newDoc,
  removeGrades,
  renameDoc,
  setFirstTerm,
} from "./actions";
import { useDeptsLoading } from "./data";
import { useModel, useProblemCounts } from "./model";
import { useFourYear } from "./store";
import { planView } from "./views";

// Plan's bar (V3 §2.13): the family bar (~/app/app-bar), as the scheduler's.
// Its context is the open plan's name with its ▾ menu (switch, Rename,
// Duplicate, New, the first semester, Delete with Undo), then undo and redo
// (V3 §2.3). Its status is where the plan is saved (this browser, or the
// account's sync icon while signed in), the credits, and the problems,
// which open the Problems view.

function RenameField({
  doc,
  onDone,
}: {
  doc: FourYearDoc;
  onDone: () => void;
}) {
  const [value, setValue] = useState(doc.name);
  // Escape unmounts the field, and a blur can still follow: finish once.
  const finished = useRef(false);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) renameDoc(doc, value);
    onDone();
  };
  return (
    <Input
      autoFocus
      aria-label="Four-year plan name"
      maxLength={60}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
      className="w-40 font-medium"
    />
  );
}

function DocMenu({ onRename }: { onRename: () => void }) {
  const { doc, today } = useModel();
  const docs = useFourYear((s) => s.history.present.docs);
  const setActive = useFourYear((s) => s.setActive);
  return (
    <DropdownMenu>
      <WithTooltip label="Switch, rename, copy or delete this four-year plan">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // The kit's one selected fill, as the scheduler's open plan tab.
            className="flex h-8 min-w-0 items-center gap-1 rounded-md bg-accent-soft pr-1.5 pl-2.5 font-medium text-base transition-colors hover:bg-hover data-[state=open]:bg-hover"
          >
            <span className="truncate">{doc.name}</span>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className="shrink-0 text-muted"
            />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="w-[240px]">
        {docs.length > 1 ? (
          <>
            <DropdownMenuLabel>Your four-year plans</DropdownMenuLabel>
            {docs.map((d) => (
              <DropdownMenuItem key={d.id} onSelect={() => setActive(d.id)}>
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.id === doc.id ? <Check aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => duplicateDoc(doc)}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => newDoc(doc.firstTermId)}>
          New four-year plan
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Starts in {fourYearTermLabel(doc.firstTermId)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[180px]">
            <DropdownMenuRadioGroup
              value={doc.firstTermId}
              onValueChange={(term) => setFirstTerm(doc, term)}
            >
              {firstTermChoices(today).map((term) => (
                <DropdownMenuRadioItem key={term} value={term}>
                  {fourYearTermLabel(term)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {Object.keys(doc.grades).length > 0 ? (
          <DropdownMenuItem onSelect={() => removeGrades(doc)}>
            Remove grades
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => deleteDoc(doc)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UndoRedo() {
  const history = useFourYear((s) => s.history);
  const undo = useFourYear((s) => s.undo);
  const redo = useFourYear((s) => s.redo);
  return (
    <div className="flex shrink-0 items-center">
      <WithTooltip label="Undo" shortcut={modKey("Z")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          disabled={!canUndo(history)}
          onClick={undo}
        >
          <Undo2 aria-hidden="true" />
        </Button>
      </WithTooltip>
      <WithTooltip label="Redo" shortcut={modKey("Z", { shift: true })}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Redo"
          disabled={!canRedo(history)}
          onClick={redo}
        >
          <Redo2 aria-hidden="true" />
        </Button>
      </WithTooltip>
    </div>
  );
}

/**
 * Where the plan is saved: while sync runs, the scheduler's status words
 * and icon, which check with the account when pressed (V3 §2.4); else a
 * quiet "Saved in this browser", from 1280px. A phone's bar has room for
 * neither, so there they're for screen readers.
 */
function SavedState({ compact }: { compact: boolean }) {
  const storageFailed = useFourYear((s) => s.storageFailed);
  const syncing = useSyncStatus((s) => s.status !== "off" && s.look !== null);
  if (syncing && !storageFailed)
    return (
      <SyncStatusLabel className={cn("h-7 shrink-0", compact && "sr-only")} />
    );
  return (
    <WithTooltip
      label={
        storageFailed
          ? "This browser won't let Terpsicle store it, so changes last until you close the tab."
          : "Your four-year plan is saved in this browser."
      }
    >
      <span
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip needs a focus stop
        tabIndex={0}
        role="status"
        className={cn(
          "shrink-0 whitespace-nowrap text-muted text-sm",
          // A tablet's bar needs the room for the plan's name; "Not saved"
          // still shows there.
          compact ? "sr-only" : !storageFailed && "max-xl:sr-only",
        )}
      >
        {storageFailed ? "Not saved" : "Saved in this browser"}
      </span>
    </WithTooltip>
  );
}

/** The plan's name and its menu, or the field that renames it. */
function PlanName() {
  const { doc } = useModel();
  const [renaming, setRenaming] = useState(false);
  return renaming ? (
    <RenameField doc={doc} onDone={() => setRenaming(false)} />
  ) : (
    <DocMenu onRename={() => setRenaming(true)} />
  );
}

export function PlanBar({
  compact,
  onOpenProblems,
}: {
  /** A phone's bar, as the scheduler's. */
  compact: boolean;
  onOpenProblems: () => void;
}) {
  const { doc, totals } = useModel();
  const counts = useProblemCounts();
  const checking = useDeptsLoading(doc);
  // Where an admin's pinned notes are looked up: the view's own path.
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <AppBar
      current="plan"
      heading
      compact={compact}
      feedback="plan"
      pathname={pathname}
      context={
        <>
          <PlanName />
          <UndoRedo />
        </>
      }
      status={
        <>
          <SavedState compact={compact} />
          {compact ? null : (
            // The sidebar starts with them; a tablet's bar has no room.
            <span className="max-lg:hidden">
              <CreditsStatus label={creditsHeadline(totals)} />
            </span>
          )}
          <ProblemsStatus
            counts={counts}
            checking={checking}
            compact={compact}
            shortcut={planView("problems").shortcut}
            onOpen={onOpenProblems}
          />
        </>
      }
    />
  );
}
