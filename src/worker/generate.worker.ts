import { expose } from "comlink";
import { generateWorkerApi } from "./generate-job";

// The generator's Web Worker (BUILD §2): the search runs here so the page
// stays responsive. Cancelling terminates the worker (see generator.ts), so
// no cancel message is needed.

expose(generateWorkerApi);
