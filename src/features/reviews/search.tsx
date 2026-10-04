import { cn } from "cn";
import { Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "~/hooks/use-media-query";
import { lazyComponent } from "~/lib/lazy-component";
import { Button } from "~/ui/button";
import { SearchField } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import {
  SEARCH_LABEL,
  SEARCH_TIP,
  type SearchBoxProps,
  searchPlaceholder,
} from "./search-words";

// Reviews' search, as the page draws it (owner, 2026-09-29: results "above
// the page, like how you'd expect an autocomplete box"). The autocomplete
// itself (./search-box.tsx, Base UI's) and a phone's sheet load after the
// page, not with it: Reviews' pages are read from a search engine first, and
// most visits never search. Until then a stand-in box, the same to the eye,
// takes what's typed and hands it, and the focus, to the real one.

/** The same field, drawn at once: what the server's HTML has. */
function StandIn(
  props: SearchBoxProps & {
    onType: (text: string) => void;
    onFocused: (focused: boolean) => void;
  },
) {
  const { variant, initialQuery = "", placeholder, inputRef } = props;
  const phone = useIsMobile();
  const field = (
    <SearchField
      ref={inputRef}
      aria-label={SEARCH_LABEL}
      placeholder={placeholder ?? searchPlaceholder(variant, phone)}
      value={initialQuery}
      onChange={(e) => props.onType(e.target.value)}
      onFocus={() => props.onFocused(true)}
      onBlur={() => props.onFocused(false)}
      autoComplete="off"
      spellCheck={false}
      className={cn(variant === "page" && "h-12 pl-4 text-lg md:h-12")}
    />
  );
  const tip = SEARCH_TIP[variant];
  return (
    <div className={variant === "bar" ? "w-72 max-w-full" : ""}>
      {tip ? (
        <WithTooltip
          label={tip}
          side={variant === "bar" ? "bottom" : undefined}
        >
          {field}
        </WithTooltip>
      ) : (
        field
      )}
    </div>
  );
}

const Box = lazyComponent(
  () => import("./search-box").then((m) => m.SearchBox),
  StandIn,
  { Loading: StandIn },
);

/** Reviews' search box: the big one on /reviews, the bar's elsewhere. */
export function ReviewsSearch(props: SearchBoxProps) {
  const [typed, setTyped] = useState(props.initialQuery ?? "");
  const [focused, setFocused] = useState(false);
  // After the page is up, not with it.
  useEffect(() => {
    void Box.preload();
  }, []);
  return (
    <Box
      {...props}
      initialQuery={typed}
      autoFocus={focused}
      onType={setTyped}
      onFocused={setFocused}
    />
  );
}

/**
 * The family bar's search on Reviews' pages past the front door: the small
 * box from `md`. (A phone has `PhoneSearchButton` instead; CSS picks, so the
 * server's HTML is right on either.)
 */
export function BarSearch() {
  return (
    <div className="max-md:hidden">
      <ReviewsSearch variant="bar" />
    </div>
  );
}

const SearchSheet = lazyComponent(
  () => import("./search-sheet").then((m) => m.SearchSheet),
  () => null,
  { Loading: null },
);

/** A phone's way in: the magnifier, then the search in a sheet. */
export function PhoneSearchButton() {
  const [open, setOpen] = useState(false);
  // The sheet's code comes with the first press (or a finger on the way).
  const [wanted, setWanted] = useState(false);
  return (
    <div className="md:hidden">
      <WithTooltip label={SEARCH_TIP.bar ?? SEARCH_LABEL}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search reviews"
          onPointerDown={() => void SearchSheet.preload()}
          onClick={() => {
            setWanted(true);
            setOpen(true);
          }}
        >
          <SearchIcon aria-hidden="true" />
        </Button>
      </WithTooltip>
      {wanted ? <SearchSheet open={open} onOpenChange={setOpen} /> : null}
    </div>
  );
}
