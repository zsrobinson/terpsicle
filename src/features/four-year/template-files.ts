import { useCallback, useEffect, useState } from "react";
import { isChunkLoadError } from "~/app/panel-load-boundary";
import {
  type FourYearTemplate,
  FourYearTemplateSchema,
} from "~/core/schema/four-year";

// Sample plans (docs/V3.md §2.11): hand-curated JSON in ./templates, one file
// per major. Vite's glob makes each file its own chunk, loaded when the
// Samples view opens, so `/plan` doesn't carry them. Each is validated on
// load, and one that doesn't validate is skipped and logged, never fatal.
// Not the route's loader: the Samples route is preloaded with every view
// (plan-page.tsx), and the files wait until the view is actually open.

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
  | {
      readonly phase: "failed";
      /**
       * A file that didn't arrive: a failed import stays failed until the
       * page loads again, so trying again means reloading.
       */
      readonly chunk: boolean;
    };

/** The sample plans, loading them the first time they're shown; `retry` loads them again. */
export function useTemplates(): TemplatesState & { retry: () => void } {
  const [state, setState] = useState<TemplatesState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    // The attempt is what re-runs this.
    void attempt;
    loadTemplates().then(
      (templates) => {
        if (live) setState({ phase: "ready", templates });
      },
      (error: unknown) => {
        console.error(error);
        if (live) setState({ phase: "failed", chunk: isChunkLoadError(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ phase: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
