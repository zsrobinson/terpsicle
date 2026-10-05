import { cn } from "cn";
import { Copy, Share2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { copyText } from "./clipboard";
import { openShareSheet, prefersShareSheet } from "./native-share";

// Share (CONTEXT.md): an icon in the family bar beside the bell and the
// account, the same in Schedule and Plan (docs/decisions.md, "One bar at the
// top"). It opens a popover right below it: the link in a read-only field,
// "Copy link", and one sentence saying the link is a copy of the plan, held
// in the URL itself, so it won't follow later edits. The link is made when
// the popover opens, from the plan as it is then. On a phone or tablet, the
// same press opens the system's share sheet with the link instead
// (./native-share), and the popover is the fallback where there's none.

export function ShareButton({
  link,
  title,
  note,
  onCopied,
  onShared,
  className,
}: {
  /** The link, made fresh each time the popover opens. */
  link: () => string;
  /** The popover's heading: "Share Plan A". */
  title: ReactNode;
  /** What the link is, in one or two plain sentences. */
  note: ReactNode;
  /** After a copy that worked: count it. */
  onCopied?: () => void;
  /** After the share sheet sent the link somewhere: count it. */
  onShared?: () => void;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const noteId = useId();

  const copy = async () => {
    if (!(await copyText(url))) return;
    noteToast("Copied link", { id: "share" });
    onCopied?.();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          return;
        }
        const made = link();
        setUrl(made);
        if (!prefersShareSheet(made)) {
          setOpen(true);
          return;
        }
        // Still inside the press, which the share sheet needs.
        void openShareSheet(made).then((result) => {
          if (result === "shared") onShared?.();
          else if (result === "failed") setOpen(true);
        });
      }}
    >
      <WithTooltip label="Share a link to this plan">
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Share"
              data-share-button=""
              className={cn(
                // The family bar's icons: Feedback's and the bell's size.
                "flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg max-[380px]:size-7",
                className,
              )}
            />
          }
        >
          <Share2 size={16} strokeWidth={1.75} aria-hidden="true" />
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        side="bottom"
        align="end"
        aria-labelledby={`${fieldId}-title`}
        aria-describedby={noteId}
        className="w-[380px] max-w-[calc(100vw-16px)] space-y-3"
      >
        <h2 id={`${fieldId}-title`} className="emph-heading text-base">
          {title}
        </h2>
        <div className="flex gap-2">
          <label htmlFor={fieldId} className="sr-only">
            Share link
          </label>
          <WithTooltip
            label="The link, selected when you click it"
            side="bottom"
          >
            <Input
              id={fieldId}
              readOnly
              value={url}
              // The whole link at once, ready for ⌘C, if the button can't.
              onFocus={(e) => e.currentTarget.select()}
              className="ident flex-1 md:text-sm"
            />
          </WithTooltip>
          <WithTooltip label="Copy the link">
            <Button onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              Copy link
            </Button>
          </WithTooltip>
        </div>
        <p id={noteId} className="text-muted text-sm">
          {note}
        </p>
      </PopoverContent>
    </Popover>
  );
}
