import type { ReactNode } from "react";

// The samples' icons, drawn here (after Fable's prototype) instead of taken
// from lucide-react: the scheduler imports the same lucide icons, and each
// icon two pages share becomes one more tiny chunk on both.

type IconProps = { className?: string; label?: string };

function Icon({
  className = "size-3.5",
  label,
  filled = false,
  children,
}: IconProps & { filled?: boolean; children: ReactNode }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: filled ? "none" : "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  } as const;
  // With a label it's an image with that name; without, decoration.
  return label ? (
    <svg role="img" aria-label={label} {...common}>
      {children}
    </svg>
  ) : (
    <svg aria-hidden="true" {...common}>
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const ProblemIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Icon>
);
export const WarnIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
  </Icon>
);
export const OkIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);
export const BellIcon = ({
  on = false,
  ...p
}: IconProps & { on?: boolean }) => (
  <Icon {...p}>
    <path
      d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
      fill={on ? "currentColor" : "none"}
    />
    <path d="M10 21h4" />
  </Icon>
);
/** The sparkles mark: only ever beside generated text. */
export const SparklesIcon = (p: IconProps) => (
  <Icon {...p} filled>
    <path d="M12 2l2.2 6.3 6.3 2.2-6.3 2.2L12 19l-2.2-6.3-6.3-2.2 6.3-2.2z" />
  </Icon>
);
export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
/** The Reviews mark's pixel star, for a chat reaction. */
export const StarIcon = ({ className = "size-2.5" }: IconProps) => (
  <svg
    viewBox="0 0 5 5"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M2 0h1v1H2ZM0 1h5v1H0ZM1 2h3v1H1ZM1 3h1v1H1ZM3 3h1v1H3ZM0 4h1v1H0ZM4 4h1v1H4Z" />
  </svg>
);
