import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureTermId } from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { EMPTY_DRAFT } from "~/state/generate-drafts";
import { loadStores } from "~/state/testing";
import { createInProcessGenerator, type Generator } from "~/worker/generator";
import {
  resetGenerateRun,
  runGenerate,
  setGenerator,
  useGenerateRun,
} from "./run-store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const draft = {
  ...EMPTY_DRAFT,
  items: [
    { kind: "course" as const, courseCode: "CMSC351", required: true },
    { kind: "course" as const, courseCode: "CMSC330", required: true },
  ],
};

describe("a Generate run", () => {
  beforeEach(async () => {
    await loadStores();
    await useCatalog.getState().ensureTerm(fixtureTermId);
    resetGenerateRun();
  });

  // Regression: in the browser, progress arrives over its own Comlink port,
  // so the last report can land after the result. It used to put the run
  // back to "Checked 29,413 combinations…" with no results shown.
  it("stays done when a progress report arrives after the result", async () => {
    const inner = createInProcessGenerator();
    const late: Generator = {
      run(request, input, onProgress) {
        const job = inner.run(request, input, () => {});
        return {
          result: job.result.then((result) => {
            setTimeout(() => onProgress({ steps: 42, found: 7 }), 0);
            return result;
          }),
          cancel: job.cancel,
        };
      },
    };
    setGenerator(late);
    await runGenerate(fixtureTermId, draft);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(useGenerateRun.getState().status.kind).toBe("done");
    setGenerator(null);
  });
});
