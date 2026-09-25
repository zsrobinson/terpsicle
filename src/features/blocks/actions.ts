import type { Block, LocalId } from "~/core/schema";
import { useShare } from "~/state/share-store";
import { useWorkspace } from "~/state/workspace-store";

// Editing and removing blocks (SPEC §3.8). Adding one is `addBlock` in
// ~/app/actions, shared with dragging on the calendar. Each is undoable.

export type BlockFields = Pick<Block, "label" | "days" | "start" | "end">;

export function updateBlock(blockId: LocalId, patch: BlockFields): boolean {
  if (useShare.getState().shared) return false;
  const block = useWorkspace.getState().blocks.find((b) => b.id === blockId);
  if (!block) return false;
  const before = useWorkspace.getState().blocks;
  useWorkspace
    .getState()
    .dispatch(
      { type: "block/update", blockId, patch },
      `Changed "${patch.label}"`,
    );
  return useWorkspace.getState().blocks !== before;
}

export function removeBlock(blockId: LocalId): boolean {
  if (useShare.getState().shared) return false;
  const block = useWorkspace.getState().blocks.find((b) => b.id === blockId);
  if (!block) return false;
  useWorkspace
    .getState()
    .dispatch({ type: "block/remove", blockId }, `Removed "${block.label}"`);
  return true;
}
