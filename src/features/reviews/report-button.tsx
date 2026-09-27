import { cn } from "cn";
import { Flag } from "lucide-react";
import { useId, useState } from "react";
import { track } from "~/app/analytics";
import { REPORT_REASON_WORDS } from "~/core/reviews";
import {
  REPORT_NOTE_MAX,
  type ReportReason,
  ReportReasonSchema,
  type ReviewId,
} from "~/core/schema";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Textarea } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { ROW_LINK } from "./frame";
import { useSignedIn } from "./level";
import { useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// "Report" on a review (V2 §9.3): pick why, add a note if it helps, send.
// The form opens in place, under the review, as a `Card`. One report per person per
// review; the server decides what it does (enough reports hide it until a
// person looks). Signing in is asked for here, not before: reading never
// needs it.

export function ReportToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <WithTooltip
      label={
        open ? "Close the report form" : "Report this review to a moderator"
      }
    >
      <Button
        variant="ghost"
        size="row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Flag size={12} aria-hidden="true" />
        Report
      </Button>
    </WithTooltip>
  );
}

type Sent = "idle" | "sending" | "own" | "gone" | "failed";

const SENT_WORDS: Partial<Record<Sent, string>> = {
  own: "That's your review. You can edit or delete it instead.",
  gone: "This review's gone already.",
  failed: "Couldn't send your report. Check your connection and try again.",
};

export function ReportForm({
  reviewId,
  onDone,
}: {
  reviewId: ReviewId;
  onDone: () => void;
}) {
  const signedIn = useSignedIn();
  const report = useReviews((s) => s.report);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<Sent>("idle");
  const noteId = useId();
  const reasonId = useId();

  if (signedIn !== true)
    return (
      <SignInPrompt>
        Sign in with your UMD account to report a review. The author never sees
        who reported it.
      </SignInPrompt>
    );

  const send = async () => {
    if (!reason) return;
    setSent("sending");
    try {
      const result = await report({
        ref: reviewId,
        reason,
        note: note.trim() === "" ? null : note.trim(),
      });
      if (result.status === "reported") {
        track("report_created", { surface: "review", reason });
        onDone();
      } else setSent(result.status === "own" ? "own" : "gone");
    } catch {
      setSent("failed");
    }
  };

  return (
    <Card className="max-w-md">
      <form
        aria-label="Report this review"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
      >
        <fieldset>
          <legend className="mb-1 font-medium">What's wrong with it?</legend>
          {/* The kit's rows, a native radio leading each: the reasons stay
              in view, and arrow keys move between them. */}
          <ul>
            {ReportReasonSchema.options.map((r) => (
              <ListRow
                key={r}
                as="li"
                density="compact"
                className="relative px-0 max-md:min-h-11"
                lead={
                  <input
                    type="radio"
                    id={`${reasonId}-${r}`}
                    name={reasonId}
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    // Over the label's row-wide target, so it's pressed itself.
                    className="relative z-10 flex size-4 accent-accent"
                  />
                }
              >
                <WithTooltip label={`Report it as: ${REPORT_REASON_WORDS[r]}`}>
                  <label
                    htmlFor={`${reasonId}-${r}`}
                    className={cn(
                      ROW_LINK,
                      "block cursor-pointer truncate",
                      reason === r ? "font-medium text-fg" : "text-muted",
                    )}
                  >
                    {REPORT_REASON_WORDS[r]}
                  </label>
                </WithTooltip>
              </ListRow>
            ))}
          </ul>
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor={noteId} className="text-muted text-sm">
            Anything a moderator should know? (optional)
          </label>
          <WithTooltip label="A note for the moderator; the author never sees it">
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              rows={2}
              data-private
              className="resize-none"
            />
          </WithTooltip>
        </div>
        <div className="flex items-center gap-2">
          <WithTooltip
            label={reason ? "Send it to a moderator" : "Pick a reason first"}
          >
            <span className="flex" tabIndex={reason ? -1 : 0}>
              <Button type="submit" disabled={!reason || sent === "sending"}>
                {sent === "sending" ? "Sending…" : "Send report"}
              </Button>
            </span>
          </WithTooltip>
          <WithTooltip label="Close without reporting" shortcut="Esc">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </WithTooltip>
        </div>
        {SENT_WORDS[sent] ? (
          <p className="text-fg text-sm" role="status">
            {SENT_WORDS[sent]}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
