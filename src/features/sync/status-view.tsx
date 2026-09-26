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

// Plan sync's state, quietly (DESIGN §5): a small icon in the top bar and a
// line in the account menu. Muted tokens only, no banner. The icons and words
// come with the engine (view.ts), so nothing here shows until it's loaded.

/**
 * The top bar's icon; nothing while signed out. Pressing it checks with the
 * account right away (a pull, then a push), the same as coming back online.
 */
export function SyncStatusIcon() {
  const { status, look, syncNow } = useSyncStatus();
  if (status === "off" || !look) return null;
  const { icon, label, tooltip } = look[status];
  return (
    <WithTooltip label={tooltip} side="bottom">
      <button
        type="button"
        aria-label={label}
        data-sync-status={status}
        onClick={() => syncNow?.()}
        className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-muted"
      >
        <Glyph paths={icon} size={15} />
      </button>
    </WithTooltip>
  );
}

/** The account menu's line: the icon and the words. */
export function SyncStatusLine() {
  const { status, look } = useSyncStatus();
  if (status === "off" || !look) return null;
  const { icon, label, tooltip } = look[status];
  return (
    <WithTooltip label={tooltip} side="left">
      <p
        data-sync-status={status}
        className="flex items-center gap-2 px-2 py-1.5 text-muted text-sm"
      >
        <Glyph paths={icon} size={14} />
        {label}
      </p>
    </WithTooltip>
  );
}
