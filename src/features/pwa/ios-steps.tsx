import { Bell, type LucideIcon, Share, SquarePlus } from "lucide-react";
import { ListRow } from "~/ui/list-row";

// Safari's Share → Add to Home Screen, drawn small: Safari's toolbar with
// Share picked out, then the share sheet's row. Decoration only; the steps
// beside it say the same in words. `IosStepRows` is the same three steps as
// numbered rows, for the sheet that asks for notifications on iPhone.

export function IosStepsIllustration() {
  return (
    <svg
      viewBox="0 0 288 72"
      className="h-auto w-full"
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Safari's toolbar: back, forward, Share (picked out), bookmarks, tabs. */}
      <rect
        x="0.5"
        y="12.5"
        width="124"
        height="47"
        rx="10"
        className="fill-panel stroke-hairline"
      />
      <g className="stroke-faint" strokeWidth="1.75">
        <path d="M19 30l-6 6 6 6" />
        <path d="M37 30l6 6-6 6" />
        <path d="M85 31h10v11H85z" />
        <rect x="102" y="30" width="11" height="11" rx="2" />
        <rect x="105" y="33" width="11" height="11" rx="2" />
      </g>
      <circle cx="62" cy="36" r="15" className="fill-accent-soft stroke-fg" />
      <g className="stroke-fg" strokeWidth="1.75">
        <path d="M62 27v11" />
        <path d="M58 31l4-4 4 4" />
        <path d="M57 34h-2v9h14v-9h-2" />
      </g>

      <path
        d="M134 36h14M143 31l5 5-5 5"
        className="stroke-faint"
        strokeWidth="1.75"
      />

      {/* The share sheet's row. */}
      <rect
        x="158.5"
        y="20.5"
        width="129"
        height="31"
        rx="7"
        className="fill-raised stroke-hairline-strong"
      />
      <text
        x="167"
        y="40"
        fontSize="10"
        fontFamily="inherit"
        className="fill-fg"
      >
        Add to Home Screen
      </text>
      <g className="stroke-fg" strokeWidth="1.5">
        <rect x="270" y="30" width="11" height="11" rx="2.5" />
        <path d="M275.5 33v5M273 35.5h5" />
      </g>
    </svg>
  );
}

/** The steps in words, with Safari's Share icon inline. */
export function IosSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-4 text-fg marker:text-muted">
      <li>
        Tap Share{" "}
        <Share
          size={13}
          aria-hidden="true"
          className="inline-block align-[-2px] text-muted"
        />{" "}
        in Safari. If you don't see it, tap ••• first.
      </li>
      <li>
        Tap Add to Home Screen, then Add. You may need to scroll to find it.
      </li>
      {/* iOS sends notifications only to the Home Screen app, not this tab. */}
      <li>Open Terpsicle from your Home Screen.</li>
    </ol>
  );
}

/** The three steps to notifications on iPhone (the design's "iPhone setup"). */
export const IOS_NOTIFICATION_STEPS: readonly IosStep[] = [
  { words: "Tap Share in Safari's bar", icon: Share },
  { words: "Choose Add to Home Screen", icon: SquarePlus },
  {
    words: "Open Terpsicle from your Home Screen. We'll ask once, right there.",
    icon: Bell,
  },
];

export interface IosStep {
  words: string;
  icon: LucideIcon;
}

/**
 * Numbered rows between hairlines, each with the icon to look for. `steps`
 * defaults to the three to the Home Screen; the Home Screen app shows its
 * own step by itself, unnumbered.
 */
export function IosStepRows({
  steps = IOS_NOTIFICATION_STEPS,
}: {
  steps?: readonly IosStep[];
}) {
  const numbered = steps.length > 1;
  return (
    <ol className="flex flex-col border-hairline border-y">
      {steps.map(({ words, icon: Icon }, i) => (
        <ListRow
          as="li"
          key={words}
          // Flush with the sheet's words; 48px, a comfortable tap's height.
          className="min-h-12 px-0"
          lead={
            numbered ? (
              <span className="block w-4 text-muted text-sm tabular-nums">
                {i + 1}
              </span>
            ) : undefined
          }
          trail={<Icon size={20} aria-hidden="true" className="text-fg" />}
        >
          <span className="text-fg">{words}</span>
        </ListRow>
      ))}
    </ol>
  );
}
