/** The mark and wordmark. UMD red appears here and nowhere else. */
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
      <span className="font-semibold text-[13.5px] tracking-tight">
        terpsicle
      </span>
    </div>
  );
}
