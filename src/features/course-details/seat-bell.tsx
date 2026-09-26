import { cn } from "cn";
import { Bell, BellDot } from "lucide-react";
import { useId, useState } from "react";
import type { SectionKey, TermId } from "~/core/schema";
import {
  subscribeMessage,
  subscribeSeatAlert,
  useLastSeatAlertEmail,
  useSeatAlert,
} from "~/features/alerts/seat-alerts";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// Seat watch (SPEC §3.12): "Watch for a seat" (a bell) on a low or full
// section, "Watching" (a filled bell) once it's on. Today's email alerts
// back it: enter an email, get one confirmation link, then "Watching".
// The same bell sits on the section row and, as a labelled button, in the
// full section's problem. Hidden while seat alerts are off.
// TODO(v2/seat-watches): signed-in watches replace the email step.

/**
 * The form it replaces had focus (the button just pressed): the answer takes
 * it, so it's read out and Esc still closes the popover.
 */
function focusOnMount(el: HTMLElement | null) {
  el?.focus();
}

export function SeatBell({
  termId,
  sectionKey,
  compact = false,
  full = true,
  variant = "icon",
}: {
  termId: TermId;
  sectionKey: SectionKey;
  /** Smaller, so compact rows keep one height with or without a bell. */
  compact?: boolean;
  /**
   * Full now. Alerts go out when a full section gets a seat back, so a low
   * section's bell says it'll email if the section fills and then reopens.
   */
  full?: boolean;
  /** `button`: the bell and its words ("Watch for a seat", "Watching"), for the problem's fix. */
  variant?: "icon" | "button";
}) {
  const alert = useSeatAlert(termId, sectionKey);
  const lastEmail = useLastSeatAlertEmail();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const errorId = useId();
  if (alert.kind === "unavailable") return null;

  const label = sectionKey.replace("-", " ");
  const tooltip =
    alert.kind === "watching"
      ? `Watching ${label}: we'll email you when a seat opens`
      : alert.kind === "pending"
        ? "Check your email to confirm"
        : full
          ? "Watch for a seat: get an email when one opens"
          : "Watch for a seat: get an email if it fills and one opens again";
  const words =
    alert.kind === "watching"
      ? "Watching"
      : alert.kind === "pending"
        ? "Check your email"
        : "Watch for a seat";
  const Icon = alert.kind === "pending" ? BellDot : Bell;
  const icon = (
    <Icon
      size={14}
      aria-hidden="true"
      // Watching is the filled bell.
      fill={alert.kind === "watching" ? "currentColor" : "none"}
    />
  );

  const submit = async (address = email || lastEmail || "") => {
    setBusy(true);
    const outcome = await subscribeSeatAlert(address, termId, sectionKey);
    setBusy(false);
    setMessage({
      text: subscribeMessage(outcome),
      ok:
        outcome.status === "check-email" ||
        outcome.status === "already-watching",
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMessage(null);
          setEmail(lastEmail ?? "");
        }
      }}
    >
      <WithTooltip label={tooltip}>
        <PopoverTrigger asChild>
          {variant === "button" ? (
            <Button
              variant="outline"
              size="row"
              data-alert={alert.kind}
              aria-label={`${words}, ${label}`}
            >
              {icon}
              {words}
            </Button>
          ) : (
            <button
              type="button"
              // A list has many bells: each says which section it's for.
              aria-label={
                alert.kind === "watching" ? tooltip : `${tooltip}, ${label}`
              }
              data-alert={alert.kind}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover",
                compact ? "size-6" : "size-7",
                alert.kind === "none" ? "text-muted hover:text-fg" : "text-fg",
              )}
            >
              {icon}
            </button>
          )}
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        className="w-72"
        side="bottom"
        align="end"
        aria-label={`Seat alert for ${label}`}
      >
        <div className="font-medium text-base">
          {full || alert.kind === "watching" ? (
            <>
              Tell me when <span className="ident">{label}</span> has a seat
            </>
          ) : (
            <>
              Tell me if <span className="ident">{label}</span> fills and a seat
              opens again
            </>
          )}
        </div>
        {alert.kind === "watching" ? (
          <p className="mt-1 text-sm text-muted">
            You're watching this
            {alert.alert.email ? ` as ${alert.alert.email}` : ""}. Stop from
            Export or from any alert email.
          </p>
        ) : alert.kind === "pending" && !message ? (
          <div className="mt-1 flex items-start gap-2">
            <p className="flex-1 text-sm text-muted">
              Check your email: click the link there to start watching.
            </p>
            {alert.alert.email ? (
              <WithTooltip
                label={`Send the link to ${alert.alert.email} again`}
              >
                <Button
                  size="row"
                  variant="ghost"
                  className="px-1.5"
                  disabled={busy}
                  onClick={() => void submit(alert.alert.email ?? "")}
                >
                  Send again
                </Button>
              </WithTooltip>
            ) : null}
          </div>
        ) : message?.ok ? (
          <p
            ref={focusOnMount}
            tabIndex={-1}
            role="status"
            className="mt-1 text-sm text-ok outline-none"
          >
            {message.text}
          </p>
        ) : (
          <form
            className="mt-2 flex flex-wrap gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {/* A failure keeps the field, says why under it, and ties the
                two together (WCAG 3.3.1). */}
            <input
              data-private
              type="email"
              required
              autoComplete="email"
              aria-label="Your email"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              placeholder="you@terpmail.umd.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-bg px-2 text-base placeholder:text-faint focus:border-hairline-strong"
            />
            <WithTooltip label="Send the confirmation link">
              <Button type="submit" size="sm" disabled={busy}>
                Email me
              </Button>
            </WithTooltip>
            {message ? (
              <p
                id={errorId}
                role="status"
                className="w-full text-sm text-error"
              >
                {message.text}
              </p>
            ) : null}
          </form>
        )}
        {alert.kind === "none" && !message ? (
          <p className="mt-2 text-xs text-muted">
            No account or password. We'll send one confirmation link, then only
            seat alerts.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
