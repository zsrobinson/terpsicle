import {
  MutationObserver,
  type QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pin } from "~/core/schema/feedback";
import { ApiCallError } from "~/server/fns/api";
import { feedbackApi } from "~/server/fns/feedback-api";
import { createTestQueryClient } from "~/state/query/testing";
import {
  isPendingPin,
  nextPinNumber,
  type PinNote,
  pinKeys,
  pinMutation,
  pinsQuery,
  unpin,
} from "./pin-queries";

// The admin's pins as a query per route, with pinning and Undo shown at
// once and put back when the server doesn't take them.

vi.mock("~/server/fns/feedback-api", () => ({
  feedbackApi: { pins: vi.fn(), pin: vi.fn(), undo: vi.fn() },
}));

const api = vi.mocked(feedbackApi);
const ROUTE = "/schedule";

const element = {
  selector: "#map",
  text: "Map",
  ids: {},
  rect: { x: 1, y: 2, width: 30, height: 40 },
};

const aPin = (number: number, over: Partial<Pin> = {}): Pin => ({
  id: `PIN${number}`.padEnd(22, "A"),
  number,
  text: `Note ${number}`,
  status: "new",
  element,
  createdAt: "2026-10-01T12:00:00.000Z",
  ...over,
});

const note: PinNote = {
  pathname: ROUTE,
  at: new Date("2026-10-04T12:00:00.000Z"),
  input: {
    product: "schedule",
    path: `${ROUTE}?tab=travel`,
    text: "  Make this bigger ",
    element,
    context: {
      version: "test",
      viewport: { width: 1440, height: 900 },
      theme: "light",
    },
  },
};

/** A promise and the functions that settle it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
const shown = () =>
  client.getQueryData<readonly Pin[]>(pinKeys.route(ROUTE)) ?? [];

/** The route's dots on screen, as the admin layer has them: loaded once. */
async function onScreen(): Promise<() => void> {
  const stop = new QueryObserver(client, pinsQuery(ROUTE)).subscribe(() => {});
  await vi.waitFor(() => expect(shown()).toHaveLength(2));
  return stop;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
  api.pins.mockResolvedValue({ pins: [aPin(1), aPin(2)] });
});

describe("pinsQuery", () => {
  it("asks for a route's pins by its pathname", async () => {
    expect(await client.fetchQuery(pinsQuery(ROUTE))).toEqual([
      aPin(1),
      aPin(2),
    ]);
    expect(api.pins).toHaveBeenCalledWith(
      { pathname: ROUTE },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("nextPinNumber", () => {
  it("is one past the highest shown", () => {
    expect(nextPinNumber([])).toBe(1);
    expect(nextPinNumber([aPin(3), aPin(1)])).toBe(4);
  });
});

describe("pinning", () => {
  it("shows the dot at once, then the server's pins", async () => {
    const stop = await onScreen();
    const sent = deferred<{ id: string; undoToken: string }>();
    api.pin.mockReturnValue(sent.promise);
    const done = new MutationObserver(client, pinMutation()).mutate(note);

    await vi.waitFor(() => expect(shown()).toHaveLength(3));
    const pending = shown()[2];
    expect(pending).toMatchObject({
      number: 3,
      text: "Make this bigger",
      status: "new",
      element,
      createdAt: "2026-10-04T12:00:00.000Z",
    });
    expect(pending && isPendingPin(pending)).toBe(true);
    expect(api.pin).toHaveBeenCalledWith(note.input);

    const third = aPin(3, { text: "Make this bigger" });
    api.pins.mockResolvedValue({ pins: [aPin(1), aPin(2), third] });
    sent.resolve({ id: third.id, undoToken: "token" });
    await done;
    await vi.waitFor(() => expect(shown()).toEqual([aPin(1), aPin(2), third]));
    expect(api.pins).toHaveBeenCalledTimes(2);
    stop();
  });

  it("takes the dot away again when the server didn't take it", async () => {
    await client.fetchQuery(pinsQuery(ROUTE));
    api.pin.mockRejectedValue(new ApiCallError("network"));
    await expect(
      new MutationObserver(client, pinMutation()).mutate(note),
    ).rejects.toThrow();
    expect(shown().some(isPendingPin)).toBe(false);
    expect(shown()).toEqual([aPin(1), aPin(2)]);
  });
});

describe("taking a pin back", () => {
  const token = { pathname: ROUTE, id: aPin(2).id, undoToken: "token" };

  it("hides the dot at once, and asks for the pins once it's done", async () => {
    const stop = await onScreen();
    const undone = deferred<{ status: "undone" | "expired" }>();
    api.undo.mockReturnValue(undone.promise);
    const done = unpin(client, token);
    await vi.waitFor(() => expect(shown()).toEqual([aPin(1)]));
    expect(api.undo).toHaveBeenCalledWith({ id: token.id, undoToken: "token" });

    api.pins.mockResolvedValue({ pins: [aPin(1)] });
    undone.resolve({ status: "undone" });
    expect(await done).toEqual({ status: "undone" });
    await vi.waitFor(() => expect(api.pins).toHaveBeenCalledTimes(2));
    expect(shown()).toEqual([aPin(1)]);
    stop();
  });

  it("puts the dot back when it's too late", async () => {
    await client.fetchQuery(pinsQuery(ROUTE));
    const pins = deferred<{ pins: Pin[] }>();
    api.pins.mockReturnValue(pins.promise);
    api.undo.mockResolvedValue({ status: "expired" });
    expect(await unpin(client, token)).toEqual({ status: "expired" });
    expect(shown()).toEqual([aPin(1), aPin(2)]);
    pins.resolve({ pins: [aPin(1), aPin(2)] });
  });

  it("puts the dot back when the server can't be reached", async () => {
    await client.fetchQuery(pinsQuery(ROUTE));
    const pins = deferred<{ pins: Pin[] }>();
    api.pins.mockReturnValue(pins.promise);
    api.undo.mockRejectedValue(new ApiCallError("network"));
    await expect(unpin(client, token)).rejects.toThrow();
    expect(shown()).toEqual([aPin(1), aPin(2)]);
    pins.resolve({ pins: [aPin(1), aPin(2)] });
  });
});
