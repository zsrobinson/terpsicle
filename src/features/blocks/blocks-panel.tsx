import { Plus, X } from "lucide-react";
import { useState } from "react";
import { addBlock } from "~/app/actions";
import {
  EmptyState,
  ListRow,
  PanelBody,
  PanelHeader,
  SectionHeader,
} from "~/app/panel";
import type { Block, LocalId } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTimeRange, sortDays } from "~/core/time";
import { useCurrentPlan } from "~/state/hooks";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { removeBlock, updateBlock } from "./actions";
import { BlockForm } from "./block-form";

// The Blocks tab (SPEC §3.8, docs/UX-REVIEW.md §4.7): what blocks are for in
// one line, the blocks themselves, then "Add a block". Blocks are per term,
// so every plan sees the same ones.

export function BlocksPanel() {
  const current = useCurrentPlan();
  const [editing, setEditing] = useState<LocalId | null>(null);
  const [adding, setAdding] = useState(false);
  const blocks = [...(current?.blocks ?? [])].sort(
    (a, b) => a.start - b.start || a.label.localeCompare(b.label),
  );
  const readOnly = current?.readOnly ?? false;
  // With nothing to list, the form is the whole point of the tab.
  const formOpen = !readOnly && (adding || blocks.length === 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Blocks" sub="Time you want to keep free" />
      <PanelBody className="pb-6">
        <p className="px-4 py-3 text-muted text-sm">
          {readOnly
            ? "The shared plan's blocks. Yours stay as they are."
            : "Blocks count as busy time for Fits my plan, Problems and Generate. You can also drag on an empty part of the calendar."}
        </p>
        {blocks.length > 0 ? (
          <section
            aria-label={readOnly ? "Blocks in this plan" : "Your blocks"}
          >
            <SectionHeader
              title={readOnly ? "Blocks in this plan" : "Your blocks"}
              count={blocks.length}
            />
            <ul aria-label="Blocks">
              {blocks.map((block) =>
                editing === block.id && !readOnly ? (
                  <li
                    key={block.id}
                    className="border-hairline border-b bg-panel px-4 py-3"
                  >
                    <BlockForm
                      initial={block}
                      submitLabel="Save block"
                      onSubmit={(fields) => {
                        updateBlock(block.id, fields);
                        setEditing(null);
                        return true;
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <BlockRow
                    key={block.id}
                    block={block}
                    readOnly={readOnly}
                    onEdit={() => setEditing(block.id)}
                  />
                ),
              )}
            </ul>
          </section>
        ) : readOnly ? (
          <EmptyState>No blocks in this plan.</EmptyState>
        ) : null}
        {readOnly ? null : formOpen ? (
          <section aria-label="Add a block">
            <SectionHeader title="Add a block" />
            <div className="px-4 py-3">
              <BlockForm
                submitLabel="Add block"
                onSubmit={(fields) => {
                  const added = addBlock(fields, "form") !== null;
                  // Stay open for the next one; Cancel closes it.
                  if (added) setAdding(true);
                  return added;
                }}
                onCancel={
                  blocks.length > 0 ? () => setAdding(false) : undefined
                }
              />
            </div>
          </section>
        ) : (
          <div className="px-4 pt-3">
            <WithTooltip label="Add time you want to keep free">
              <Button
                variant="outline"
                className="h-7 px-2.5 text-sm"
                onClick={() => setAdding(true)}
              >
                <Plus size={13} aria-hidden="true" />
                Add a block
              </Button>
            </WithTooltip>
          </div>
        )}
      </PanelBody>
    </div>
  );
}

/** "Mon, Wed · 12pm–1pm" */
export function blockWhen(
  block: Pick<Block, "days" | "start" | "end">,
): string {
  const days = sortDays(block.days)
    .map((d) => DAY_SHORT_NAMES[d])
    .join(", ");
  return `${days} · ${formatTimeRange(block.start, block.end)}`;
}

function BlockRow({
  block,
  readOnly,
  onEdit,
}: {
  block: Block;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const main = (
    <>
      <span className="block truncate font-medium text-base">
        {block.label}
      </span>
      <span className="tnum block text-muted text-sm">{blockWhen(block)}</span>
    </>
  );
  return (
    <ListRow
      as="li"
      className="relative hover:bg-hover"
      lead={
        <span
          aria-hidden="true"
          className="stripes block size-4 rounded-sm border border-hairline-strong bg-panel"
        />
      }
      action={
        readOnly ? undefined : (
          <WithTooltip label={`Remove "${block.label}". You can undo this.`}>
            <button
              type="button"
              aria-label={`Remove ${block.label}`}
              onClick={() => removeBlock(block.id)}
              // Above the row's edit button, which covers the whole row.
              className="relative z-10 flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          </WithTooltip>
        )
      }
    >
      {readOnly ? (
        main
      ) : (
        <WithTooltip label={`Edit "${block.label}"`}>
          <button
            type="button"
            aria-label={`Edit ${block.label}`}
            onClick={onEdit}
            className="block w-full text-left after:absolute after:inset-0"
          >
            {main}
          </button>
        </WithTooltip>
      )}
    </ListRow>
  );
}
