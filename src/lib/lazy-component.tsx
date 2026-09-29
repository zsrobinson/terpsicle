import { type ReactNode, useEffect, useSyncExternalStore } from "react";

// A component whose code loads on first use, for what a page draws only
// sometimes: the router's loading and failure states, the toasts, the
// marketing page's account menu. Like `React.lazy`, it suspends until the
// code is here. Unlike it, a chunk that doesn't arrive (offline, or a deploy
// removed it) never throws and never sticks: `Fallback` shows instead, and
// the code is asked for again when it mounts next and when the browser comes
// back online, replacing the fallback once it's here.

type Component<P> = (props: P) => ReactNode;

export type LazyComponent<P> = Component<P> & {
  /** Fetches the code; settles once it's here or has failed. */
  preload: () => Promise<void>;
};

const LOADING = "loading";
const FAILED = "failed";

export function lazyComponent<P extends object>(
  load: () => Promise<Component<P>>,
  Fallback: Component<P>,
): LazyComponent<P> {
  let Loaded: Component<P> | null = null;
  let loading: Promise<void> | null = null;
  let failed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const snapshot = () => Loaded ?? (failed ? FAILED : LOADING);

  const preload = (): Promise<void> => {
    if (Loaded) return Promise.resolve();
    loading ??= load().then(
      (component) => {
        Loaded = component;
        failed = false;
        notify();
      },
      () => {
        // The next mount or `online` asks again.
        loading = null;
        failed = true;
        notify();
      },
    );
    return loading;
  };

  function Lazy(props: P) {
    const state = useSyncExternalStore(subscribe, snapshot, snapshot);
    const showingFallback = state === FAILED;
    useEffect(() => {
      if (!showingFallback) return;
      void preload();
      const retry = () => void preload();
      window.addEventListener("online", retry);
      return () => window.removeEventListener("online", retry);
    }, [showingFallback]);
    if (state === LOADING) throw preload();
    if (state === FAILED) return <Fallback {...props} />;
    const Ready = state;
    return <Ready {...props} />;
  }
  return Object.assign(Lazy, { preload });
}
