import { cn } from "cn";
import { Copy, Share2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { copyText } from "./clipboard";

// Share (CONTEXT.md): the outlined "Share" button at the top left of a
// workbench's canvas, the same in Schedule and Plan. It opens a popover
// right below it: the link in a read-only field, "Copy link", and one
// sentence saying the link is a copy of the plan, held in the URL itself,
// so it won't follow later edits. The link is made when the popover opens,
// from the plan as it is then.

export function ShareButton({
  link,
  title,
  note,
  onCopied,
  shrink = false,
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
  /**
   * A hint shares the canvas bar: in a narrow bar (a phone, a tablet with
   * the sidebar open) the word gives way and the icon stays, still named
   * "Share", so the hint's sentence fits.
   */
  shrink?: boolean;
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
        if (next) setUrl(link());
        setOpen(next);
      }}
    >
      <WithTooltip label="Share a link to this plan">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-share-button=""
            className={cn(
              // A phone's 44px target, as the kit's icon size has.
              shrink && "@max-2xl/canvas:max-md:min-w-11",
              className,
            )}
          >
            <Share2 aria-hidden="true" />
            <span className={shrink ? "@max-2xl/canvas:sr-only" : undefined}>
              Share
            </span>
          </Button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        side="bottom"
        align="start"
        aria-labelledby={`${fieldId}-title`}
        aria-describedby={noteId}
        className="w-[380px] max-w-[calc(100vw-16px)] space-y-3"
      >
        <h2 id={`${fieldId}-title`} className="font-semibold text-base">
          {title}
        </h2>
        <div className="flex gap-2">
          <label htmlFor={fieldId} className="sr-only">
            Share link
          </label>
          <Input
            id={fieldId}
            readOnly
            value={url}
            // The whole link at once, ready for ⌘C, if the button can't.
            onFocus={(e) => e.currentTarget.select()}
            className="ident flex-1 md:text-sm"
          />
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
