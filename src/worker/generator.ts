import { proxy, type Remote, wrap } from "comlink";
import type { GenerateRequest, GenerateResult } from "~/core/schema";
import {
  type GenerateInput,
  type GenerateProgress,
  type GenerateWorkerApi,
  runGenerate,
} from "./generate-job";

// How the app runs the generator: in a Web Worker in the browser, in-process
// where there are no workers (tests). Stopping a run terminates its worker;
// the next run starts a fresh one, so a long search never blocks the next.

export type { GenerateInput, GenerateProgress };

/** The run was stopped (Stop, or a newer run replaced it). */
export class GenerateCancelled extends Error {
  constructor() {
    super("Generating was stopped");
    this.name = "GenerateCancelled";
  }
}

export interface GenerateJob {
  readonly result: Promise<GenerateResult>;
  cancel(): void;
}

export interface Generator {
  run(
    request: GenerateRequest,
    input: GenerateInput,
    onProgress: (progress: GenerateProgress) => void,
  ): GenerateJob;
}

/**
 * The worker's script didn't load or threw at the top level. The usual cause
 * is a deploy since the page loaded: the old hashed script is gone.
 */
export class GeneratorUnavailable extends Error {
  constructor() {
    super(
      "Couldn't start generating. Reload the page to get the latest version.",
    );
    this.name = "GeneratorUnavailable";
  }
}

/** Runs each request in the module worker, one at a time. */
export function createWorkerGenerator(
  spawn: () => Worker = () =>
    new Worker(new URL("./generate.worker.ts", import.meta.url), {
      type: "module",
      name: "generate",
    }),
): Generator {
  let worker: Worker | null = null;
  let remote: Remote<GenerateWorkerApi> | null = null;
  return {
    run(request, input, onProgress) {
      if (!worker || !remote) {
        worker = spawn();
        remote = wrap<GenerateWorkerApi>(worker);
      }
      const mine = worker;
      let reject: (error: Error) => void = () => {};
      const stopped = new Promise<never>((_, r) => {
        reject = r;
      });
      const drop = () => {
        if (worker !== mine) return;
        mine.terminate();
        worker = null;
        remote = null;
      };
      // Comlink never settles a call to a worker that failed to start, so
      // without this the run would spin forever.
      const onError = () => {
        drop();
        reject(new GeneratorUnavailable());
      };
      mine.addEventListener("error", onError);
      const result = Promise.race([
        remote.generate(request, input, proxy(onProgress)),
        stopped,
      ]).finally(() => mine.removeEventListener("error", onError));
      return {
        result,
        cancel() {
          drop();
          reject(new GenerateCancelled());
        },
      };
    },
  };
}

/** Runs on the calling thread after a tick; for tests and browsers without workers. */
export function createInProcessGenerator(): Generator {
  return {
    run(request, input, onProgress) {
      let cancelled = false;
      const result = new Promise<GenerateResult>((resolve, reject) => {
        setTimeout(() => {
          if (cancelled) return reject(new GenerateCancelled());
          try {
            resolve(runGenerate(request, input, onProgress, () => cancelled));
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
      return {
        result: result.then((r) => {
          if (cancelled) throw new GenerateCancelled();
          return r;
        }),
        cancel() {
          cancelled = true;
        },
      };
    },
  };
}

let shared: Generator | null = null;

/** The app's generator: a worker where the platform has them. */
export function defaultGenerator(): Generator {
  shared ??=
    typeof Worker === "undefined"
      ? createInProcessGenerator()
      : createWorkerGenerator();
  return shared;
}
