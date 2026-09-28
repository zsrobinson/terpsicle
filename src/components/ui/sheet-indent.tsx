import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

// The page behind an open sheet (./sheet.tsx). On phones it scales back and
// drops a little, over the ink behind it, the way iOS shows that a sheet is
// modal; a drag on the sheet brings it forward as the sheet goes. Base UI's
// Drawer indent: every sheet inside the provider marks it `data-active`.
// It's its own module so the page's first load carries only the provider,
// never the drawer itself.
//
// While it's scaled, the page is a containing block, so a fixed element
// inside it is placed against the page's box. Pages that fill the screen
// (the workbenches, Todo, Chat) don't notice; a page that scrolls keeps its
// fixed pieces out of it or accepts them moving for the moment a sheet is up.

/** Where the page scales from: the top of what's on screen. */
function useScrollOrigin() {
  const last = useRef("50% 0px");
  return (active: boolean): CSSProperties => {
    // Measured as a sheet opens and kept while it closes, so the page scales
    // back to where it left from. The sheet locks the page's scroll between.
    if (active && typeof window !== "undefined")
      last.current = `50% ${window.scrollY}px`;
    return { transformOrigin: last.current };
  };
}

export function SheetIndent({ children }: { children: ReactNode }) {
  const origin = useScrollOrigin();
  return (
    <Drawer.Provider>
      <Drawer.IndentBackground
        aria-hidden="true"
        className="fixed inset-0 bg-indent"
      />
      <Drawer.Indent
        data-sheet-indent=""
        style={(state) => origin(state.active)}
        className={cn(
          // Opaque, so the ink behind shows only at the scaled page's edges;
          // styles.css paints the paper's grain on it.
          "min-h-dvh bg-bg",
          // The drawer docs' indent: 0.98 and 8px down, eased back as the
          // sheet is dragged away, with no transition while a finger drives it.
          "[--indent-p:var(--drawer-swipe-progress,0)]",
          // A sheet with detents reports large-to-medium there, not a
          // dismissal: the page stays back at both (./sheet.tsx).
          "[body:has([data-slot=sheet][data-detent])_&]:[--indent-p:0]",
          "[--indent-t:calc(1-clamp(0,calc(var(--indent-p)*100000),1))]",
          "transition-transform duration-[calc(400ms*var(--indent-t))] ease-sheet",
          "max-md:data-active:[transform:scale(calc(0.98+0.02*var(--indent-p)))_translateY(calc(8px*(1-var(--indent-p))))]",
          // Reduce Motion: the sheet fades in over a page that stays put.
          "motion-reduce:data-active:transform-none!",
        )}
      >
        {children}
      </Drawer.Indent>
    </Drawer.Provider>
  );
}
