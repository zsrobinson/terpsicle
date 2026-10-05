import { useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  Eraser,
  MonitorCheck,
  MonitorX,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRef, useState } from "react";
import { AppBar } from "~/components/app-bar";
import {
  CreditsStatus,
  ProblemsStatus,
  SyncSlot,
} from "~/components/workbench/status";
import { creditsHeadline } from "~/core/four-year/credits";
import { firstTermChoices, fourYearTermLabel } from "~/core/four-year/terms";
import { canRedo, canUndo } from "~/core/plans/history";
import type { FourYearDoc } from "~/core/schema/four-year";
import { SyncStatusSlot, useSyncSlotShown } from "~/features/sync/status-view";
import { modKey } from "~/lib/shortcuts";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuSub,
  usePhoneMenus,
} from "~/ui/action-menu";
import { Button } from "~/ui/button";
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
import { useModel, useProblemCounts } from "./model";
import { PlanShare } from "./share";
import { useFourYear } from "./store";
import { planView } from "./views";

// Plan's bar (V3 §2.13): the family bar (~/components/app-bar), as the scheduler's.
// Its context is the open plan's name with its ▾ menu (switch, Rename,
// Duplicate, New, the first semester, Delete with Undo), then undo and redo
// (V3 §2.3); on a phone the menu is a sheet (the kit's ActionMenu), since
// its submenu of first semesters has no room there. Its status is where the
// plan is saved (this browser, or the account while signed in: the sync
// slot, as in Schedule's and Todo's bars), the credits, and the problems,
// which open the Problems view; then Share.

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
    <ActionMenu
      title="Four-year plans"
      tooltip="Switch, rename, copy or delete this four-year plan"
      className="w-[240px]"
      trigger={
        <button
          type="button"
          // The kit's one selected fill, as the scheduler's open plan tab.
          className="flex h-8 min-w-0 items-center gap-1 rounded-md bg-accent-soft pr-1.5 pl-2.5 font-medium text-base transition-colors hover:bg-hover data-popup-open:bg-hover"
        >
          <span className="truncate">{doc.name}</span>
          <ChevronDown
            size={13}
            aria-hidden="true"
            className="shrink-0 text-muted"
          />
        </button>
      }
    >
      {docs.length > 1 ? (
        <>
          <ActionMenuRadioGroup
            label="Your four-year plans"
            value={doc.id}
            onValueChange={setActive}
          >
            {docs.map((d) => (
              <ActionMenuRadioItem key={d.id} value={d.id}>
                {d.name}
              </ActionMenuRadioItem>
            ))}
          </ActionMenuRadioGroup>
          <ActionMenuSeparator />
        </>
      ) : null}
      <ActionMenuItem onSelect={onRename}>Rename</ActionMenuItem>
      <ActionMenuItem onSelect={() => duplicateDoc(doc)}>
        Duplicate
      </ActionMenuItem>
      <ActionMenuItem onSelect={() => newDoc(doc.firstTermId)}>
        New four-year plan
      </ActionMenuItem>
      <ActionMenuSub
        label={`Starts in ${fourYearTermLabel(doc.firstTermId)}`}
        className="w-[180px]"
      >
        <ActionMenuRadioGroup
          value={doc.firstTermId}
          onValueChange={(term) => setFirstTerm(doc, term)}
        >
          {firstTermChoices(today).map((term) => (
            <ActionMenuRadioItem key={term} value={term}>
              {fourYearTermLabel(term)}
            </ActionMenuRadioItem>
          ))}
        </ActionMenuRadioGroup>
      </ActionMenuSub>
      <ActionMenuSeparator />
      {Object.keys(doc.grades).length > 0 ? (
        <ActionMenuItem onSelect={() => removeGrades(doc)}>
          Remove grades
        </ActionMenuItem>
      ) : null}
      <ActionMenuItem onSelect={() => deleteDoc(doc)}>Delete</ActionMenuItem>
    </ActionMenu>
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
 * Where the plan is saved, in the bar's sync slot (~/components/workbench/
 * status, as Schedule's and Todo's): while sync runs, plan sync's cloud and
 * word, which check with the account when pressed (V3 §2.4); else a monitor
 * and "Saved in this browser". A phone's bar has no room, so there the
 * words are for screen readers.
 */
function SavedState({ compact }: { compact: boolean }) {
  const storageFailed = useFourYear((s) => s.storageFailed);
  const syncing = useSyncSlotShown();
  if (syncing && !storageFailed) return <SyncStatusSlot compact={compact} />;
  const word = storageFailed ? "Not saved" : "Saved in this browser";
  if (compact)
    return (
      <span role="status" className="sr-only">
        {word}
      </span>
    );
  const Icon = storageFailed ? MonitorX : MonitorCheck;
  return (
    <SyncSlot
      icon={<Icon size={15} strokeWidth={1.75} aria-hidden="true" />}
      word={word}
      tooltip={
        storageFailed
          ? "This browser won't let Terpsicle store it, so changes last until you close the tab."
          : "Your four-year plan is saved in this browser."
      }
    />
  );
}

/** The plan's name and its menu, or the field that renames it. */
function PlanName() {
  const { doc } = useModel();
  const phone = usePhoneMenus();
  const [renaming, setRenaming] = useState(false);
  return renaming ? (
    <RenameField doc={doc} onDone={() => setRenaming(false)} />
  ) : phone ? (
    <DocSheet onRename={() => setRenaming(true)} />
  ) : (
    <DocMenu onRename={() => setRenaming(true)} />
  );
}

/**
 * A phone's four-year plans: the same choices as the ▾ menu, in one sheet,
 * with the first semester as a list of its own at the end.
 */
function DocSheet({ onRename }: { onRename: () => void }) {
  const { doc, today, totals } = useModel();
  const docs = useFourYear((s) => s.history.present.docs);
  const setActive = useFourYear((s) => s.setActive);
  // Rename puts a field where the button was: the sheet leaves focus there.
  const renaming = useRef(false);
  return (
    <ActionMenu
      title="Four-year plans"
      description={`${doc.name} · ${totals.earned} earned, ${totals.inProgress} in progress, ${totals.planned} planned`}
      tooltip="Switch, rename, copy or delete this four-year plan"
      finalFocus={() => {
        const sent = renaming.current;
        renaming.current = false;
        return sent ? false : null;
      }}
      trigger={
        // The plan's name over its credits: a phone's bar says where it
        // stands, so nothing needs a row of its own under the bar.
        <button
          type="button"
          className="flex h-10 min-w-0 items-center gap-1 rounded-md pr-1.5 pl-1.5 text-left transition-colors hover:bg-hover data-popup-open:bg-hover"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium text-base leading-tight">
              {doc.name}
            </span>
            <span className="tnum block truncate text-muted text-xs leading-tight">
              {creditsHeadline(totals)}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-muted"
          />
        </button>
      }
    >
      {docs.length > 1 ? (
        <>
          <ActionMenuRadioGroup value={doc.id} onValueChange={setActive}>
            {docs.map((d) => (
              <ActionMenuRadioItem key={d.id} value={d.id}>
                {d.name}
              </ActionMenuRadioItem>
            ))}
          </ActionMenuRadioGroup>
          <ActionMenuSeparator />
        </>
      ) : null}
      <ActionMenuItem
        icon={<Plus aria-hidden="true" />}
        onSelect={() => newDoc(doc.firstTermId)}
      >
        New four-year plan
      </ActionMenuItem>
      <ActionMenuItem
        icon={<Copy aria-hidden="true" />}
        onSelect={() => duplicateDoc(doc)}
      >
        Duplicate
      </ActionMenuItem>
      <ActionMenuItem
        icon={<Pencil aria-hidden="true" />}
        onSelect={() => {
          renaming.current = true;
          onRename();
        }}
      >
        Rename
      </ActionMenuItem>
      {Object.keys(doc.grades).length > 0 ? (
        <ActionMenuItem
          icon={<Eraser aria-hidden="true" />}
          onSelect={() => removeGrades(doc)}
        >
          Remove grades
        </ActionMenuItem>
      ) : null}
      <ActionMenuItem
        variant="destructive"
        icon={<Trash2 aria-hidden="true" />}
        onSelect={() => deleteDoc(doc)}
      >
        Delete
      </ActionMenuItem>
      <ActionMenuSeparator />
      <ActionMenuRadioGroup
        label="Starts in"
        value={doc.firstTermId}
        onValueChange={(term) => setFirstTerm(doc, term)}
      >
        {firstTermChoices(today).map((term) => (
          <ActionMenuRadioItem key={term} value={term}>
            {fourYearTermLabel(term)}
          </ActionMenuRadioItem>
        ))}
      </ActionMenuRadioGroup>
    </ActionMenu>
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
  const { totals, deptsLoading: checking } = useModel();
  const counts = useProblemCounts();
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
      share={<PlanShare />}
      status={
        <>
          <SavedState compact={compact} />
          {compact ? null : (
            // From 1024px. A tablet's bar has no room, so there the
            // sidebar says them.
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
