import { useEffect, useState } from "react";
import {
  type FourYearTemplate,
  FourYearTemplateSchema,
} from "~/core/schema/four-year";

// Sample plans (docs/V3.md §2.11): hand-curated JSON in ./templates, one file
// per major. Vite's glob makes each file its own chunk, loaded when the
// Samples tab opens, so `/plan` doesn't carry them. Each is validated on
// load, and one that doesn't validate is skipped and logged, never fatal.
// Not a route loader: `/plan` renders the board and the open doc whatever
// the tab, and a loader keyed on `tab` would hold the whole page's
// navigation for one side-panel tab; this loads inside the tab instead.

const FILES = import.meta.glob<unknown>("./templates/*.json", {
  import: "default",
});

/**
 * Every sample plan, by name. The browser's module map caches each import,
 * so opening the tab again costs nothing.
 */
export async function loadTemplates(): Promise<readonly FourYearTemplate[]> {
  const all = await Promise.all(
    Object.entries(FILES).map(async ([path, load]) => {
      const parsed = FourYearTemplateSchema.safeParse(await load());
      if (parsed.success) return parsed.data;
      console.warn(
        `Skipped a sample plan that doesn't validate: ${path}`,
        parsed.error,
      );
      return null;
    }),
  );
  return all
    .filter((t): t is FourYearTemplate => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type TemplatesState =
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly templates: readonly FourYearTemplate[] }
  | { readonly phase: "failed" };

/** The sample plans, loading them the first time they're shown. */
export function useTemplates(): TemplatesState {
  const [state, setState] = useState<TemplatesState>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    loadTemplates().then(
      (templates) => {
        if (live) setState({ phase: "ready", templates });
      },
      (error: unknown) => {
        console.error(error);
        if (live) setState({ phase: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
