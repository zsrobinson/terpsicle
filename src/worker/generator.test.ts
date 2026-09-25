import { expose } from "comlink";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_CAMPUS } from "~/core/travel";
import { aGenerateRequest, mockCourses, mockSeats } from "~/fixtures";
import { type GenerateInput, generateWorkerApi } from "./generate-job";
import {
  createInProcessGenerator,
  createWorkerGenerator,
  GenerateCancelled,
  GeneratorUnavailable,
} from "./generator";

const input: GenerateInput = {
  courses: mockCourses(),
  seats: mockSeats.seats,
  campus: EMPTY_CAMPUS,
  quality: [],
};

const request = aGenerateRequest({
  items: [
    { kind: "course", courseCode: "CMSC351", required: true },
    { kind: "course", courseCode: "CMSC330", required: true },
  ],
});

/**
 * A stand-in Worker: the real API exposed on the other end of a
 * MessageChannel, which is what Comlink sees in a browser worker too.
 */
function fakeWorkers() {
  const spawned: { terminated: boolean }[] = [];
  const ports: MessagePort[] = [];
  const spawn = () => {
    const channel = new MessageChannel();
    expose(generateWorkerApi, channel.port2);
    ports.push(channel.port1, channel.port2);
    const record = { terminated: false };
    spawned.push(record);
    const worker = Object.assign(channel.port1, {
      terminate() {
        record.terminated = true;
        channel.port1.close();
        channel.port2.close();
      },
    });
    return worker as unknown as Worker;
  };
  return {
    spawn,
    spawned,
    close: () => {
      for (const p of ports) p.close();
    },
  };
}

describe("in-process generator", () => {
  it("runs a request", async () => {
    const job = createInProcessGenerator().run(request, input, () => {});
    const result = await job.result;
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.totalFound).toBeGreaterThanOrEqual(result.results.length);
  });

  it("rejects with GenerateCancelled when stopped", async () => {
    const job = createInProcessGenerator().run(request, input, () => {});
    job.cancel();
    await expect(job.result).rejects.toBeInstanceOf(GenerateCancelled);
  });
});

describe("worker generator", () => {
  let workers: ReturnType<typeof fakeWorkers>;
  afterEach(() => workers.close());

  it("runs a request through Comlink and reuses the worker", async () => {
    workers = fakeWorkers();
    const generator = createWorkerGenerator(workers.spawn);
    const first = await generator.run(request, input, () => {}).result;
    const second = await generator.run(request, input, () => {}).result;
    expect(first.results.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(workers.spawned).toHaveLength(1);
  });

  it("terminates the worker on cancel and starts a fresh one next time", async () => {
    workers = fakeWorkers();
    const generator = createWorkerGenerator(workers.spawn);
    const job = generator.run(request, input, () => {});
    job.cancel();
    await expect(job.result).rejects.toBeInstanceOf(GenerateCancelled);
    expect(workers.spawned[0]?.terminated).toBe(true);
    const next = await generator.run(request, input, () => {}).result;
    expect(next.results.length).toBeGreaterThan(0);
    expect(workers.spawned).toHaveLength(2);
  });

  it("fails the run, instead of hanging, when the worker can't start", async () => {
    workers = fakeWorkers();
    // A worker whose script 404s (a deploy since the page loaded): nothing
    // ever answers, and the Worker fires "error".
    let terminated = false;
    const broken = Object.assign(new EventTarget(), {
      postMessage() {},
      terminate() {
        terminated = true;
      },
    }) as unknown as Worker;
    let spawns = 0;
    const generator = createWorkerGenerator(() =>
      spawns++ === 0 ? broken : workers.spawn(),
    );
    const job = generator.run(request, input, () => {});
    broken.dispatchEvent(new Event("error"));
    await expect(job.result).rejects.toBeInstanceOf(GeneratorUnavailable);
    await expect(job.result).rejects.toThrow(/^Couldn't/);
    expect(terminated).toBe(true);
    // The next run starts over with a fresh worker.
    const next = await generator.run(request, input, () => {}).result;
    expect(next.results.length).toBeGreaterThan(0);
  });
});
