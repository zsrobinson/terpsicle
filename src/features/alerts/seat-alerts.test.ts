import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import type { LocalSeatAlert } from "~/core/schema";
import { fixtureTermId } from "~/fixtures";
import { ApiCallError } from "~/server/fns/api";
import { INITIAL_SEAT_ALERTS_STATE, useSeatAlerts } from "~/state/seat-alerts";
import { ALERTS_INBOX_KEY, putAlertsInbox, readAlertsInbox } from "./inbox";
import {
  seatAlertState,
  stopSeatAlert,
  subscribeMessage,
  subscribeSeatAlert,
} from "./seat-alerts";
import { mergeInbox, refreshSeatAlerts, syncSeatAlerts } from "./sync";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const NOW = new Date("2026-09-25T12:00:00.000Z");
const TOKEN = "T".repeat(43);
const SUB = "S".repeat(22);
const KEY = "CMSC351-0301";

const aWatch = (overrides: Partial<LocalSeatAlert> = {}): LocalSeatAlert => ({
  termId: fixtureTermId,
  sectionKey: KEY,
  email: "testudo@umd.edu",
  status: "active",
  subscriptionId: SUB,
  manageToken: TOKEN,
  createdAt: "2026-09-24T12:00:00.000Z",
  updatedAt: "2026-09-24T12:00:00.000Z",
  ...overrides,
});

const alerts = () => useSeatAlerts.getState().alerts;

describe("seat alerts", () => {
  beforeEach(() => {
    localStorage.clear();
    useSeatAlerts.setState({ ...INITIAL_SEAT_ALERTS_STATE, loaded: true });
    vi.mocked(track).mockClear();
  });

  describe("subscribe", () => {
    it("asks for a confirmation email and writes a pending row", async () => {
      const subscribe = vi.fn(async () => ({ status: "check-email" as const }));
      const outcome = await subscribeSeatAlert(
        "  Testudo@UMD.edu ",
        fixtureTermId,
        KEY,
        { now: NOW, client: { subscribe } },
      );
      expect(outcome).toEqual({ status: "check-email" });
      expect(subscribe).toHaveBeenCalledWith({
        email: "testudo@umd.edu",
        termId: fixtureTermId,
        sectionKey: KEY,
      });
      expect(alerts()).toEqual([
        expect.objectContaining({
          status: "pending",
          email: "testudo@umd.edu",
          subscriptionId: null,
        }),
      ]);
      expect(track).toHaveBeenCalledWith("seat_alert_requested", {});
      expect(subscribeMessage(outcome)).toMatch(/Check your email/);
    });

    it("says you're already watching from the local list, without a request", async () => {
      await useSeatAlerts.getState().put([aWatch()]);
      const subscribe = vi.fn();
      const outcome = await subscribeSeatAlert(
        "a@umd.edu",
        fixtureTermId,
        KEY,
        {
          client: { subscribe },
        },
      );
      expect(outcome).toEqual({ status: "already-watching" });
      expect(subscribeMessage(outcome)).toBe("You're already watching this.");
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("rejects a bad address before sending", async () => {
      const subscribe = vi.fn();
      expect(
        await subscribeSeatAlert("nope", fixtureTermId, KEY, {
          client: { subscribe },
        }),
      ).toEqual({ status: "invalid-email" });
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("hides seat alerts when the server says they're off", async () => {
      const subscribe = vi.fn(async () => ({ status: "unavailable" as const }));
      await subscribeSeatAlert("a@umd.edu", fixtureTermId, KEY, {
        client: { subscribe },
      });
      expect(useSeatAlerts.getState().availability).toBe("unavailable");
      expect(seatAlertState(undefined, "unavailable")).toEqual({
        kind: "unavailable",
      });
      expect(alerts()).toEqual([]);
    });

    it("words network trouble", async () => {
      const subscribe = vi.fn(async () => {
        throw new ApiCallError("network");
      });
      const outcome = await subscribeSeatAlert(
        "a@umd.edu",
        fixtureTermId,
        KEY,
        {
          client: { subscribe },
        },
      );
      expect(subscribeMessage(outcome)).toMatch(/Check your connection/);
    });
  });

  describe("state", () => {
    it("reads none, pending or watching", () => {
      expect(seatAlertState(undefined, "available").kind).toBe("none");
      expect(
        seatAlertState(aWatch({ status: "pending" }), "unknown").kind,
      ).toBe("pending");
      expect(seatAlertState(aWatch(), "available").kind).toBe("watching");
    });
  });

  describe("stop", () => {
    it("unsubscribes with the manage token and drops the row", async () => {
      await useSeatAlerts.getState().put([aWatch()]);
      const unsubscribe = vi.fn(async () => ({
        status: "unsubscribed" as const,
        termId: fixtureTermId,
        sectionKey: KEY,
      }));
      expect(
        await stopSeatAlert(fixtureTermId, KEY, { client: { unsubscribe } }),
      ).toEqual({ status: "stopped" });
      expect(unsubscribe).toHaveBeenCalledWith({ token: TOKEN });
      expect(alerts()).toEqual([]);
      expect(track).toHaveBeenCalledWith("seat_alert_stopped", {});
    });

    it("can't stop a watch confirmed elsewhere", async () => {
      await useSeatAlerts
        .getState()
        .put([aWatch({ subscriptionId: null, manageToken: null })]);
      expect(await stopSeatAlert(fixtureTermId, KEY)).toEqual({
        status: "no-token",
      });
      expect(alerts()).toHaveLength(1);
    });

    it("keeps the row when the request fails", async () => {
      await useSeatAlerts.getState().put([aWatch()]);
      const unsubscribe = vi.fn(async () => {
        throw new ApiCallError("network");
      });
      const outcome = await stopSeatAlert(fixtureTermId, KEY, {
        client: { unsubscribe },
      });
      expect(outcome.status).toBe("error");
      expect(alerts()).toHaveLength(1);
    });
  });

  describe("sync", () => {
    it("merges the confirm page's inbox: tokens in, stopped watches out", () => {
      const pending = aWatch({
        status: "pending",
        subscriptionId: null,
        manageToken: null,
      });
      const other = aWatch({ sectionKey: "ENGL393-0101" });
      const { put, remove } = mergeInbox(
        [pending, other],
        [
          {
            termId: fixtureTermId,
            sectionKey: KEY,
            subscriptionId: SUB,
            manageToken: TOKEN,
            status: "active",
            at: NOW.toISOString(),
          },
          {
            termId: fixtureTermId,
            sectionKey: "ENGL393-0101",
            subscriptionId: SUB,
            manageToken: TOKEN,
            status: "unsubscribed",
            at: NOW.toISOString(),
          },
        ],
      );
      expect(put).toEqual([
        {
          ...pending,
          status: "active",
          subscriptionId: SUB,
          manageToken: TOKEN,
          updatedAt: NOW.toISOString(),
        },
      ]);
      expect(remove).toEqual([other]);
    });

    it("imports the inbox, clears it, and refreshes statuses", async () => {
      putAlertsInbox({
        termId: fixtureTermId,
        sectionKey: KEY,
        subscriptionId: SUB,
        manageToken: TOKEN,
        status: "active",
        at: NOW.toISOString(),
      });
      const status = vi.fn(async () => ({
        status: "ok" as const,
        items: [{ subscriptionId: SUB, status: "active" as const }],
      }));
      await syncSeatAlerts(NOW, { status });
      expect(readAlertsInbox()).toEqual([]);
      expect(localStorage.getItem(ALERTS_INBOX_KEY)).toBeNull();
      expect(alerts()).toEqual([
        expect.objectContaining({
          sectionKey: KEY,
          email: null,
          status: "active",
        }),
      ]);
      expect(status).toHaveBeenCalledWith({
        items: [{ subscriptionId: SUB, manageToken: TOKEN }],
      });
      expect(useSeatAlerts.getState().availability).toBe("available");
    });

    it("drops watches the server no longer has", async () => {
      await useSeatAlerts.getState().put([aWatch()]);
      await refreshSeatAlerts(NOW, {
        status: async () => ({
          status: "ok",
          items: [{ subscriptionId: SUB, status: "unknown" }],
        }),
      });
      expect(alerts()).toEqual([]);
    });

    it("learns that seat alerts are off, even with no watches", async () => {
      const status = vi.fn(async () => ({ status: "unavailable" as const }));
      await refreshSeatAlerts(NOW, { status });
      expect(status).toHaveBeenCalledWith({ items: [] });
      expect(useSeatAlerts.getState().availability).toBe("unavailable");
    });
  });
});
