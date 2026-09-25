/** The mark and wordmark. UMD red appears here and nowhere else. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        role="img"
        aria-label="Terpsicle"
      >
        <rect
          x="1"
          y="1"
          width="16"
          height="16"
          rx="4.5"
          className="fill-logo"
        />
        <rect
          x="5"
          y="4.5"
          width="3"
          height="5"
          rx="1"
          className="fill-logo-fg"
        />
        <rect
          x="10"
          y="7.5"
          width="3"
          height="6"
          rx="1"
          className="fill-logo-fg"
          opacity=".7"
        />
      </svg>
      {compact ? null : (
        <span
          aria-hidden="true"
          className="font-semibold text-base tracking-tight"
        >
          terpsicle
        </span>
      )}
    </div>
  );
}
