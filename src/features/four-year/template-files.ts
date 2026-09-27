import { useEffect, useState } from "react";
import {
  type FourYearTemplate,
  FourYearTemplateSchema,
} from "~/core/schema/four-year";

// Sample plans (docs/V3.md §2.11): hand-curated JSON in ./templates, one file
// per major. Vite's glob makes each file its own chunk, loaded when the
// Samples tab opens, so `/plan` doesn't carry them. Each is validated on
// load, and one that doesn't validate is skipped and logged, never fatal.

const FILES = import.meta.glob<unknown>("./templates/*.json", {
  import: "default",
});

let loading: Promise<readonly FourYearTemplate[]> | null = null;

/** Every sample plan, by name. */
export function loadTemplates(): Promise<readonly FourYearTemplate[]> {
  loading ??= Promise.all(
    Object.entries(FILES).map(async ([path, load]) => {
      const parsed = FourYearTemplateSchema.safeParse(await load());
      if (parsed.success) return parsed.data;
      console.warn(
        `Skipped a sample plan that doesn't validate: ${path}`,
        parsed.error,
      );
      return null;
    }),
  )
    .then((all) =>
      all
        .filter((t): t is FourYearTemplate => t !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    .catch((error: unknown) => {
      // A chunk that failed to load (offline, a new deploy) can be retried.
      loading = null;
      throw error;
    });
  return loading;
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
