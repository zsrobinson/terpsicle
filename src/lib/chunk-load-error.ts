// A view that loads on first use (a route's chunk, the phone drawer) can
// fail to arrive: offline, or a deploy removed the old chunk. What says so is
// in ~/components/panel-load-boundary and the router's failure state; this is
// only the error, in a module of its own, so the route tree every page loads
// (a loader throws it) doesn't carry the panel's views too.

/** A lazy chunk didn't arrive: offline, or a deploy removed it. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super("Couldn't load part of Terpsicle", { cause });
    this.name = "ChunkLoadError";
  }
}

/** A failed `import()`, in any browser's words, or our own ChunkLoadError. */
export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof ChunkLoadError) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return (
    typeof message === "string" &&
    /^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)/.test(
      message,
    )
  );
}
