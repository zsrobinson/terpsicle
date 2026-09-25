import { Pencil, X } from "lucide-react";
import { useState } from "react";
import { addBlock } from "~/app/actions";
import { PanelBody, PanelHeader, PanelLabel } from "~/app/panel";
import type { Block, LocalId } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTimeRange, sortDays } from "~/core/time";
import { useCurrentPlan } from "~/state/hooks";
import { WithTooltip } from "~/ui/tooltip";
import { removeBlock, updateBlock } from "./actions";
import { BlockForm } from "./block-form";

// The Blocks tab (SPEC §3.8): labeled busy time for the term, and a form to
// add more. Blocks are per term, so every plan sees the same ones.

export function BlocksPanel() {
  const current = useCurrentPlan();
  const [editing, setEditing] = useState<LocalId | null>(null);
  const blocks = [...(current?.blocks ?? [])].sort(
    (a, b) => a.start - b.start || a.label.localeCompare(b.label),
  );
  const readOnly = current?.readOnly ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Blocks" sub="Time you want to keep free" />
      <PanelBody className="pb-4">
        <p className="px-4 pt-3 text-[12px] text-muted leading-relaxed">
          {readOnly
            ? "The shared plan's blocks. Yours stay as they are."
            : "Blocks count as busy time for Fits my plan, Problems and Generate. You can also drag on an empty part of the calendar."}
        </p>
        {blocks.length > 0 ? (
          <>
            <PanelLabel>
              {readOnly ? "Blocks in this plan" : "Your blocks"}
            </PanelLabel>
            <ul className="flex flex-col gap-2 px-4" aria-label="Blocks">
              {blocks.map((block) =>
                editing === block.id && !readOnly ? (
                  <li
                    key={block.id}
                    className="rounded-lg border border-hairline-strong bg-raised p-3"
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
          </>
        ) : null}
        {readOnly ? null : (
          <div className="mx-4 mt-4 rounded-lg border border-hairline p-3">
            <h3 className="mb-2 font-medium text-[12.5px]">Add a block</h3>
            <BlockForm
              submitLabel="Add block"
              onSubmit={(fields) => addBlock(fields, "form") !== null}
            />
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
  return (
    <li className="group flex items-center gap-3 rounded-lg border border-hairline bg-raised p-3">
      <span
        aria-hidden="true"
        className="stripes size-5 shrink-0 rounded border border-hairline bg-panel"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[12.5px]">{block.label}</div>
        <div className="tnum text-[11.5px] text-muted">{blockWhen(block)}</div>
      </div>
      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-0.5">
          <WithTooltip label={`Edit "${block.label}"`}>
            <button
              type="button"
              aria-label={`Edit ${block.label}`}
              onClick={onEdit}
              className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Pencil size={13} aria-hidden />
            </button>
          </WithTooltip>
          <WithTooltip label={`Remove "${block.label}". You can undo this.`}>
            <button
              type="button"
              aria-label={`Remove ${block.label}`}
              onClick={() => removeBlock(block.id)}
              className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          </WithTooltip>
        </div>
      )}
    </li>
  );
}
