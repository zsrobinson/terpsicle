import { cn } from "cn";
import type { ConnectionVerdict } from "~/core/schema";

// The one place a verdict's color is decided (SPEC §3.3): neutral when
// there's enough time, amber when tight, red when there isn't enough. Route
// data that's missing is neutral too, never a warning.

export const VERDICT_TEXT = {
  ok: "text-muted",
  tight: "text-warn",
  insufficient: "text-error",
  unknown: "text-faint",
  "no-route": "text-faint",
} as const satisfies Record<ConnectionVerdict, string>;

const DOT = {
  ok: "bg-hairline-strong",
  tight: "bg-warn",
  insufficient: "bg-error",
  unknown: "border border-hairline-strong",
  "no-route": "border border-hairline-strong",
} as const satisfies Record<ConnectionVerdict, string>;

export function VerdictDot({
  verdict,
  className,
}: {
  verdict: ConnectionVerdict;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", DOT[verdict], className)}
    />
  );
}
