import { cn } from "cn";
import { Bell, BellDot, BellRing } from "lucide-react";
import { useState } from "react";
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

// The bell on a low or full section (SPEC §3.12): enter an email, get one
// confirmation link, then "Watching". Hidden while seat alerts are off.

export function SeatBell({
  termId,
  sectionKey,
  compact = false,
  full = true,
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
}) {
  const alert = useSeatAlert(termId, sectionKey);
  const lastEmail = useLastSeatAlertEmail();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  if (alert.kind === "unavailable") return null;

  const label = sectionKey.replace("-", " ");
  const tooltip =
    alert.kind === "watching"
      ? `Watching ${label}: we'll email you when a seat opens`
      : alert.kind === "pending"
        ? "Check your email to confirm"
        : full
          ? "Get an email when a seat opens"
          : "Get an email if it fills and a seat opens again";
  const Icon =
    alert.kind === "watching"
      ? BellRing
      : alert.kind === "pending"
        ? BellDot
        : Bell;

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
          <button
            type="button"
            aria-label={tooltip}
            data-alert={alert.kind}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover",
              compact ? "size-6" : "size-7",
              alert.kind === "none" ? "text-muted hover:text-fg" : "text-fg",
            )}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent className="w-72" side="bottom" align="end">
        <div className="font-medium text-[12.5px]">
          {full || alert.kind === "watching" ? (
            <>
              Tell me when <span className="font-mono">{label}</span> has a seat
            </>
          ) : (
            <>
              Tell me if <span className="font-mono">{label}</span> fills and a
              seat opens again
            </>
          )}
        </div>
        {alert.kind === "watching" ? (
          <p className="mt-1 text-[12px] text-muted">
            You're watching this
            {alert.alert.email ? ` as ${alert.alert.email}` : ""}. Stop from
            Export or from any alert email.
          </p>
        ) : alert.kind === "pending" && !message ? (
          <div className="mt-1 flex items-start gap-2">
            <p className="flex-1 text-[12px] text-muted">
              Check your email: click the link there to start watching.
            </p>
            {alert.alert.email ? (
              <WithTooltip
                label={`Send the link to ${alert.alert.email} again`}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11.5px]"
                  disabled={busy}
                  onClick={() => void submit(alert.alert.email ?? "")}
                >
                  Send again
                </Button>
              </WithTooltip>
            ) : null}
          </div>
        ) : message ? (
          <p
            role="status"
            className={cn(
              "mt-1 text-[12px]",
              message.ok ? "text-ok" : "text-error",
            )}
          >
            {message.text}
          </p>
        ) : (
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              data-private
              type="email"
              required
              autoComplete="email"
              aria-label="Your email"
              placeholder="you@terpmail.umd.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-hairline bg-bg px-2 text-[12.5px] outline-none placeholder:text-faint focus:border-hairline-strong"
            />
            <WithTooltip label="Send the confirmation link">
              <Button type="submit" size="sm" disabled={busy}>
                Email me
              </Button>
            </WithTooltip>
          </form>
        )}
        {alert.kind === "none" && !message ? (
          <p className="mt-2 text-[11px] text-muted">
            No account or password. We'll send one confirmation link, then only
            seat alerts.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
