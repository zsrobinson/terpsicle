import {
  mutationOptions,
  type QueryClient,
  queryOptions,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type {
  NotificationSettings,
  PushDevice,
} from "~/core/schema/notifications";
import { useAccount } from "~/features/auth/account-store";
import { retryApi } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { refetchWhenRunSettles } from "~/state/query/settle-run";
import { noteToast } from "~/ui/toast";
import { currentEndpoint } from "./this-device";

// /settings/notifications' server data as TanStack Query (V2.md §6.2,
// docs/decisions.md "TanStack Query for server data and its caching"): the
// settings, with whether Todo has an ELMS feed, and the devices with
// notifications on. Saving is an optimistic mutation over the settings,
// and removing a device one over the list. Nothing is persisted, and
// signing out forgets both.
//
// Apart from the bell's keys (./queries): a read in the bell asks for
// everything under `notifications` again, and that mustn't land over a
// switch still saving.

export const settingsKeys = {
  /** Everything here: what signing out forgets. */
  all: ["notification-settings"] as const,
  settings: ["notification-settings", "settings"] as const,
  devices: ["notification-settings", "devices"] as const,
  /** The removals' mutations, pending while Undo's toast shows. */
  remove: ["notification-settings", "devices", "remove"] as const,
};

/**
 * How long either counts as current: they change here (each change shows
 * at once) or on another device. Coming back to the tab after this asks
 * again.
 */
export const SETTINGS_STALE_MS = 60_000;

export interface SettingsAnswer {
  settings: NotificationSettings;
  /** "Due tomorrow" needs an ELMS feed in Todo (V3.md §4). */
  todoConnected: boolean;
}

/**
 * The person's settings. Offline, it says so (after `retryApi`'s tries)
 * rather than waiting to be online, as the page always has.
 */
export function notificationSettingsQuery() {
  return queryOptions({
    queryKey: settingsKeys.settings,
    queryFn: async ({ signal }): Promise<SettingsAnswer> => {
      const answer = await notificationsApi.settings({ signal });
      return {
        settings: answer.settings,
        todoConnected: answer.todoConnected === true,
      };
    },
    staleTime: SETTINGS_STALE_MS,
    retry: retryApi,
    networkMode: "always",
  });
}

/** The devices with notifications on, this one marked `current`. */
export function pushDevicesQuery() {
  return queryOptions({
    queryKey: settingsKeys.devices,
    queryFn: async ({ signal }): Promise<readonly PushDevice[]> => {
      const endpoint = await currentEndpoint();
      const answer = await notificationsApi.devices(
        endpoint ? { endpoint } : {},
        { signal },
      );
      return answer.devices;
    },
    staleTime: SETTINGS_STALE_MS,
    retry: retryApi,
    networkMode: "always",
  });
}

/**
 * Saving the settings: shown at once, and put back if the server didn't
 * take it. Each save sends every setting, so saves run one at a time, in
 * the order they were made (`scope`): an older one can't land after a
 * newer one. Once the last has settled, the settings are asked for again.
 * Offline, it fails at once, as it always has, rather than waiting.
 */
export function saveSettingsMutation() {
  return mutationOptions({
    mutationKey: settingsKeys.settings,
    scope: { id: "notification-settings" },
    networkMode: "always",
    mutationFn: (next: NotificationSettings) =>
      notificationsApi.setSettings({ settings: next }),
    onMutate: (next, { client }) => {
      // An answer on its way would land over the change. Cancelling puts
      // the query back as it was before that fetch, there and then, so the
      // change can show in the same tick as the click, without waiting.
      void client.cancelQueries({ queryKey: settingsKeys.settings });
      const before = client.getQueryData<SettingsAnswer>(settingsKeys.settings);
      if (before)
        client.setQueryData(settingsKeys.settings, {
          ...before,
          settings: next,
        });
      return {
        before,
        shown: client.getQueryData<SettingsAnswer>(settingsKeys.settings),
      };
    },
    onError: (_error, _next, context, { client }) => {
      // Only while nothing newer shows: a later change has its own save.
      if (
        context?.before &&
        client.getQueryData(settingsKeys.settings) === context.shown
      )
        client.setQueryData(settingsKeys.settings, context.before);
    },
    onSettled: (_data, _error, _next, _context, { client }) =>
      refetchWhenRunSettles(client, settingsKeys.settings, () => {
        void client.invalidateQueries({ queryKey: settingsKeys.settings });
      }),
  });
}

/** How a removal's Undo window ended. */
export type RemoveDecision =
  /** Undo: nothing is sent. */
  | "undo"
  /** The toast went: the server hears. */
  | "remove"
  /** The page is closing: the server hears, with `keepalive`. */
  | "closing";

export interface RemoveDevice {
  device: PushDevice;
  /** Settles as Undo's window closes. */
  decided: Promise<RemoveDecision>;
}

/**
 * Removing a device (no confirmation, DESIGN §5): pending from the click,
 * so the row is gone from every list at once (`useRemovingDevices`), over
 * whatever a refresh brings back. The server hears once Undo's toast has
 * gone, or as the page closes; Undo sends nothing, and the row comes back.
 * A failure brings it back too, and says so.
 */
export function removeDeviceMutation() {
  return mutationOptions({
    mutationKey: settingsKeys.remove,
    networkMode: "always",
    mutationFn: async ({ device, decided }: RemoveDevice): Promise<boolean> => {
      const decision = await decided;
      if (decision === "undo") return false;
      // A closing page still sends it.
      const keepalive = decision === "closing";
      const fetcher: typeof fetch = (input, init) =>
        fetch(input, { ...init, keepalive });
      await notificationsApi.remove({ id: device.id }, { fetcher });
      return true;
    },
    onSuccess: async (removed, { device }, _context, { client }) => {
      if (!removed) return;
      // A list on its way may still have it.
      await client.cancelQueries({ queryKey: settingsKeys.devices });
      client.setQueryData<readonly PushDevice[]>(settingsKeys.devices, (list) =>
        list?.filter((d) => d.id !== device.id),
      );
    },
    onError: async (_error, { device, decided }) => {
      // A closed page has no one to tell.
      if ((await decided) === "closing") return;
      noteToast(
        `Couldn't remove ${device.label ?? "a device"}. Check your connection and try again.`,
      );
    },
  });
}

/** The devices being removed: hidden from every list until it's settled. */
export function useRemovingDevices(): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: settingsKeys.remove, status: "pending" },
    // The only mutations under this key are `removeDeviceMutation`'s.
    select: (mutation) =>
      (mutation.state.variables as RemoveDevice | undefined)?.device.id,
  });
  // The same array until the ids change (Query compares them deeply).
  return useMemo(
    () => new Set(ids.filter((id): id is string => id !== undefined)),
    [ids],
  );
}

/** Forgets everything here (signing out). */
export function forgetNotificationSettings(client: QueryClient): void {
  client.removeQueries({ queryKey: settingsKeys.all });
}

/**
 * Forgets the settings and devices once no one is signed in, so they're
 * not kept in memory for whoever signs in next.
 */
export function useForgetSettingsOnSignOut(): void {
  const client = useQueryClient();
  const signedOut = useAccount((s) => s.status === "signed-out");
  useEffect(() => {
    if (signedOut) forgetNotificationSettings(client);
  }, [signedOut, client]);
}
