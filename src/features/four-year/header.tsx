import { Check, ChevronDown, Redo2, Undo2 } from "lucide-react";
import { useState } from "react";
import { modKey } from "~/app/shortcuts";
import { firstTermChoices, fourYearTermLabel } from "~/core/four-year/terms";
import { canRedo, canUndo } from "~/core/plans/history";
import type { FourYearDoc } from "~/core/schema/four-year";
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
import { WithTooltip } from "~/ui/tooltip";
import {
  deleteDoc,
  duplicateDoc,
  newDoc,
  renameDoc,
  setFirstTerm,
} from "./actions";
import { MENU_ITEM } from "./block";
import { useModel } from "./model";
import { useFourYear } from "./store";

// The top of Plan: the open plan's name with its ▾ menu (switch, Rename,
// Duplicate, New, the first semester, Delete with Undo), whether it's saved,
// and undo and redo (V3 §2.3, §2.13).

function RenameField({
  doc,
  onDone,
}: {
  doc: FourYearDoc;
  onDone: () => void;
}) {
  const [value, setValue] = useState(doc.name);
  const finish = (save: boolean) => {
    if (save) renameDoc(doc, value);
    onDone();
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: it replaces the name the person just chose to rename
      autoFocus
      aria-label="Plan name"
      maxLength={60}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") finish(false);
      }}
      className="h-11 w-full max-w-[280px] border border-fg bg-raised px-2 font-semibold text-lg outline-none md:h-8"
    />
  );
}

function DocMenu({ onRename }: { onRename: () => void }) {
  const { doc, today } = useModel();
  const docs = useFourYear((s) => s.history.present.docs);
  const setActive = useFourYear((s) => s.setActive);
  return (
    <DropdownMenu>
      <WithTooltip label="Switch, rename, copy or delete this plan">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="-mx-1 flex h-11 min-w-0 items-center gap-1 px-1 font-semibold text-lg hover:bg-hover data-[state=open]:bg-hover md:h-8"
          >
            <span className="truncate">{doc.name}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
            />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="w-[240px]">
        {docs.length > 1 ? (
          <>
            <DropdownMenuLabel>Your plans</DropdownMenuLabel>
            {docs.map((d) => (
              <DropdownMenuItem
                key={d.id}
                className={MENU_ITEM}
                onSelect={() => setActive(d.id)}
              >
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                {d.id === doc.id ? <Check aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem className={MENU_ITEM} onSelect={onRename}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          className={MENU_ITEM}
          onSelect={() => duplicateDoc(doc)}
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          className={MENU_ITEM}
          onSelect={() => newDoc(doc.firstTermId)}
        >
          New plan
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={MENU_ITEM}>
            Starts in {fourYearTermLabel(doc.firstTermId)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[180px]">
            <DropdownMenuRadioGroup
              value={doc.firstTermId}
              onValueChange={(term) => setFirstTerm(doc, term)}
            >
              {firstTermChoices(today).map((term) => (
                <DropdownMenuRadioItem
                  key={term}
                  value={term}
                  className={MENU_ITEM}
                >
                  {fourYearTermLabel(term)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => deleteDoc(doc)}>
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
    <div className="flex items-center">
      <WithTooltip label="Undo" shortcut={modKey("Z")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          disabled={!canUndo(history)}
          onClick={undo}
          className="size-11 md:size-7"
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
          className="size-11 md:size-7"
        >
          <Redo2 aria-hidden="true" />
        </Button>
      </WithTooltip>
    </div>
  );
}

export function PlanHeader() {
  const { doc } = useModel();
  const [renaming, setRenaming] = useState(false);
  const storageFailed = useFourYear((s) => s.storageFailed);
  return (
    <header className="flex min-h-11 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {renaming ? (
          <RenameField doc={doc} onDone={() => setRenaming(false)} />
        ) : (
          <DocMenu onRename={() => setRenaming(true)} />
        )}
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
            className="shrink-0 text-muted text-sm max-sm:sr-only"
          >
            {storageFailed ? "Not saved" : "Saved in this browser"}
          </span>
        </WithTooltip>
      </div>
      <UndoRedo />
    </header>
  );
}
