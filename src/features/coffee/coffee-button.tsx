import { cn } from "cn";
import { createLucideIcon } from "lucide-react";
import { useState } from "react";
import { track } from "~/lib/analytics";
import { ActionMenuLinkItem } from "~/ui/action-menu";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// The coffee button (the owner, 2026-09-28): beside Feedback in the family
// bar, a small popover asks whether Terpsicle helps, and links out to the
// developer's Buy Me a Coffee page. It never nags: nothing opens it but a
// click. On phones, where the bar has no room for it, it's a link in the
// account menu instead.

export const COFFEE_URL = "https://buymeacoffee.com/zsrobinson";

export const COFFEE_PITCH =
  "Does Terpsicle help you out? Support its development by buying its developer a coffee.";

/** Lucide's coffee cup with a heart in it, in Lucide's stroke. */
export const CoffeeHeart = createLucideIcon("coffee-heart", [
  ["path", { d: "M10 2v2", key: "steam-1" }],
  ["path", { d: "M14 2v2", key: "steam-2" }],
  ["path", { d: "M6 2v2", key: "steam-3" }],
  [
    "path",
    {
      d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
      key: "cup",
    },
  ],
  [
    "path",
    {
      d: "M10 18 7 15a2 2 0 0 1 3-2.8 2 2 0 0 1 3 2.8Z",
      fill: "currentColor",
      strokeWidth: 1,
      key: "heart",
    },
  ],
]);

/**
 * The bar's button and its popover, on tablets and desktops. Its box follows
 * Feedback's beside it: 28px beside Feedback's label, 32px where Feedback
 * is an icon too.
 */
export function CoffeeButton({
  labelFrom2xl = false,
  className,
}: {
  /** As Feedback's: its label shows from 1536px, so it's 32px below that. */
  labelFrom2xl?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) track("coffee_opened", {});
      }}
    >
      <WithTooltip label="Support Terpsicle" side="bottom">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Support Terpsicle"
            data-testid="coffee-button"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg",
              labelFrom2xl ? "size-7 max-2xl:size-8" : "size-7",
              // Phones (MOBILE_QUERY) before the page's code knows it's one.
              "max-[769px]:hidden",
              className,
            )}
          >
            <CoffeeHeart size={16} aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent align="end" className="w-[272px]">
        <p className="text-base">{COFFEE_PITCH}</p>
        <WithTooltip label="Opens Buy Me a Coffee in a new tab" side="bottom">
          <Button asChild size="sm" className="mt-3">
            <a
              href={COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track("coffee_link_clicked", { via: "popover" });
                setOpen(false);
              }}
            >
              <CoffeeHeart aria-hidden="true" />
              Buy me a coffee
            </a>
          </Button>
        </WithTooltip>
      </PopoverContent>
    </Popover>
  );
}

/** The account menu's item, on a bar with no room for the button. */
export function CoffeeMenuItem() {
  return (
    <ActionMenuLinkItem
      icon={<CoffeeHeart aria-hidden="true" className="text-muted" />}
      render={
        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("coffee_link_clicked", { via: "menu" })}
        />
      }
    >
      Buy me a coffee
    </ActionMenuLinkItem>
  );
}
