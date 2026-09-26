import { type ComponentType, lazy, useState } from "react";

// Kept apart from registry.tsx: that file imports every feature's panels.tsx,
// and these import this, so the helpers must not wait on the registry.

/** A lazy chunk didn't arrive: offline, or a deploy removed it. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super("Couldn't load part of Terpsicle", { cause });
    this.name = "ChunkLoadError";
  }
}

/**
 * A feature's code that loads on first use, in its own chunk, so the
 * scheduler's first load doesn't carry panels nobody has opened yet
 * (scripts/check-bundle.ts keeps them out of it). `current` is the module
 * once it has loaded.
 */
export interface LazyModule<M> {
  load: () => Promise<M>;
  readonly current: M | undefined;
}

export function lazyModule<M>(importer: () => Promise<M>): LazyModule<M> {
  let loading: Promise<M> | undefined;
  let current: M | undefined;
  return {
    load: () => {
      loading ??= importer().then(
        (m) => {
          current = m;
          return m;
        },
        (error: unknown) => {
          // A failed chunk (offline, a deploy in between) can be tried again.
          loading = undefined;
          throw error instanceof ChunkLoadError
            ? error
            : new ChunkLoadError(error);
        },
      );
      return loading;
    },
    get current() {
      return current;
    },
  };
}

/** A component from a lazy module; the sidebar shows a skeleton while it loads. */
export type LazyPanel<P> = ComponentType<P> & {
  preload: () => Promise<unknown>;
};

export function lazyPanel<M, P extends object>(
  module: LazyModule<M>,
  pick: (m: M) => ComponentType<P>,
): LazyPanel<P> {
  const Lazy = lazy(async () => {
    const component = pick(await module.load());
    // Vite's loader resolves a failed chunk to nothing once load-recovery
    // has taken the error (to reload the page).
    if (!component) throw new ChunkLoadError("empty module");
    return { default: component };
  });
  function Panel(props: P) {
    // Once loaded, render it straight away: React.lazy would still suspend
    // for a tick and flash the skeleton. Decided once per mount, so the
    // panel's state survives the load finishing.
    const [loaded] = useState(() => module.current);
    if (loaded === undefined) return <Lazy {...props} />;
    const Loaded = pick(loaded);
    return <Loaded {...props} />;
  }
  return Object.assign(Panel, { preload: module.load });
}
