import { SyncSlot } from "~/components/workbench/status";
import { ActionMenuText } from "~/ui/action-menu";
import { WithTooltip } from "~/ui/tooltip";
import { useSyncStatus } from "./status";

/** A Lucide-style icon from its paths (view.ts). Decorative: words say it. */
function Glyph({ paths, size }: { paths: readonly string[]; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// Plan sync's state, quietly (DESIGN §5): the family bar's sync slot
// (~/components/workbench/status, the same in Schedule, Plan and Todo) and a
// line in the account menu. Muted tokens only, no banner. The icons and words
// come with the engine (view.ts), so nothing here shows until it's loaded.

/**
 * The bar's sync slot while signed in: a cloud and a word. Pressing it
 * checks with the account right away (a pull, then a push), the same as
 * coming back online. A phone's bar has no room: there it's words for
 * screen readers, and the account menu has the line.
 */
export function SyncStatusSlot({ compact = false }: { compact?: boolean }) {
  const { status, look, syncNow } = useSyncStatus();
  if (status === "off" || !look) return null;
  const { icon, word, tooltip } = look[status];
  if (compact)
    return (
      <span role="status" data-sync-status={status} className="sr-only">
        {word}
      </span>
    );
  return (
    <SyncSlot
      icon={<Glyph paths={icon} size={15} />}
      word={word}
      tooltip={tooltip}
      data-sync-status={status}
      onPress={() => syncNow?.()}
    />
  );
}

/** Whether the bar's sync slot has anything to show. */
export function useSyncSlotShown(): boolean {
  return useSyncStatus((s) => s.status !== "off" && s.look !== null);
}

/** The account menu's line: the icon and the words. */
export function SyncStatusLine() {
  const { status, look } = useSyncStatus();
  if (status === "off" || !look) return null;
  const { icon, label, tooltip } = look[status];
  return (
    <ActionMenuText>
      <WithTooltip label={tooltip} side="left">
        <p data-sync-status={status} className="flex items-center gap-2">
          <Glyph paths={icon} size={14} />
          {label}
        </p>
      </WithTooltip>
    </ActionMenuText>
  );
}
