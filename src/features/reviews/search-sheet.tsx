import { useRef } from "react";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { SearchBox } from "./search-box";

// A phone's search on Reviews' pages past the front door: the kit's sheet,
// the box at its top and the results under it. The box takes focus as the
// sheet opens, so the keyboard comes up with it. Loaded on the first press
// of the bar's magnifier (./search.tsx).

export function SearchSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} initialFocus={input}>
      <div className="flex min-h-[70dvh] flex-col gap-2 px-4 pt-1 pb-4">
        <SheetTitle className="font-semibold text-lg tracking-tight">
          Search reviews
        </SheetTitle>
        <SearchBox
          variant="sheet"
          inputRef={input}
          onPicked={() => onOpenChange(false)}
        />
      </div>
    </Sheet>
  );
}
