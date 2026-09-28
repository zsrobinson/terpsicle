import { ChunkLoadError } from "~/components/panel-load-boundary";
import {
  type FourYearTemplate,
  FourYearTemplateSchema,
} from "~/core/schema/four-year";

// Sample plans (docs/V3.md §2.11): hand-curated JSON in ./templates, one file
// per major. Vite's glob makes each file its own chunk, loaded by the
// Samples route's loader (src/routes/plan.samples.tsx), so `/plan` doesn't
// carry them. Each is validated on load, and one that doesn't validate is
// skipped and logged, never fatal. A file that doesn't arrive throws, to the
// route's error state.

const FILES = import.meta.glob<unknown>("./templates/*.json", {
  import: "default",
});

/**
 * Every sample plan, by name. The browser's module map caches each import,
 * so loading them again costs nothing.
 */
export async function loadTemplates(): Promise<readonly FourYearTemplate[]> {
  const all = await Promise.all(
    Object.entries(FILES).map(async ([path, load]) => {
      const json = await load();
      // Vite's loader resolves a failed chunk to nothing once
      // load-recovery has taken the error.
      if (json === undefined)
        throw new ChunkLoadError(new Error(`${path} didn't arrive`));
      const parsed = FourYearTemplateSchema.safeParse(json);
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
