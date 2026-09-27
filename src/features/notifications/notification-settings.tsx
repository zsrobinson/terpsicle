import { cn } from "cn";
import { Bell, Mail } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { track } from "~/app/analytics";
import {
  channelOn,
  NOTIFICATION_CHANNELS,
  withChannel,
} from "~/core/notifications";
import type {
  Channel,
  NotificationSettings,
  NotificationType,
  PushDevice,
} from "~/core/schema/notifications";
import { useAccount } from "~/features/auth/account-store";
import { InstallAppSetting } from "~/features/pwa/install-setting";
import { ApiCallError } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  currentEndpoint,
  notificationPermission,
  type PushSupport,
  pushSupport,
  type TurnOnResult,
  turnOffHere,
  turnOnHere,
} from "./this-device";

// /settings/notifications (V2.md §6.2): what to send, this device, and the
// devices with notifications on. Loaded only for someone signed in.

interface TypeRow {
  type: NotificationType;
  title: string;
  detail: string;
  /**
   * Whether anything sends this type yet. Rows stay visible and quiet until
   * their feature calls `notify` (src/server/notifications/notify.ts).
   */
  sending: boolean;
}

export const TYPE_ROWS: readonly TypeRow[] = [
  {
    type: "seat-open",
    title: "Seat openings",
    detail: "When a section you're watching gets an open seat.",
    sending: true,
  },
  {
    type: "chat-mention",
    title: "Mentions in Chat",
    detail: "When a classmate mentions you in a class chat.",
    sending: true,
  },
  {
    type: "chat-reply",
    title: "Replies in Chat",
    detail:
      "When a classmate replies in a thread you started. Muting a room stops these.",
    sending: true,
  },
  {
    type: "chat-digest",
    title: "Chat digest",
    detail:
      "Once a day, an email listing mentions and replies you haven't read.",
    sending: true,
  },
  {
    type: "todo-due",
    title: "Due tomorrow",
    detail: "At 6pm, when something in Todo is due the next day.",
    sending: false,
  },
];

const CHANNEL_WORDS: Record<Channel, string> = {
  push: "Notification",
  email: "Email",
};

/** "Sep 26" in the reader's time zone. */
export function addedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const TURN_ON_WORDS: Record<Exclude<TurnOnResult, "on">, string | null> = {
  denied:
    "Your browser blocked notifications for Terpsicle. Allow them in its site settings, then try again.",
  dismissed: null,
  "no-service-worker":
    "Notifications need the app from terpsicle.com. Reload the page and try again.",
  unsupported: "This browser can't get notifications from Terpsicle.",
  "off-here": "Notifications are turned off on Terpsicle for now.",
  failed:
    "Couldn't turn on notifications. Check your connection and try again.",
};

const TRY_AGAIN =
  "That didn't go through. Check your connection and try again.";

export function NotificationSettingsSection() {
  const pushOn = useAccount((s) => s.flags.push);
  const publicKey = useAccount((s) => s.pushPublicKey);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  // Devices removed but still in Undo's window: hidden from every list,
  // whatever a refresh brings back, until the server hears or Undo.
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const endpoint = await currentEndpoint();
      const [s, d] = await Promise.all([
        notificationsApi.settings(),
        notificationsApi.devices(endpoint ? { endpoint } : {}),
      ]);
      setSettings(s.settings);
      setDevices(d.devices);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (failed && !settings)
    return (
      <p role="status" className="text-fg">
        Couldn't load your notification settings. Check your connection and
        reload the page.
      </p>
    );
  if (!settings || !devices)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );

  const shown = devices.filter((d) => !removing.has(d.id));
  const startRemove = (id: string) =>
    setRemoving((ids) => new Set(ids).add(id));
  const endRemove = (id: string, removed: boolean) => {
    setRemoving((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
    if (removed) setDevices((list) => list?.filter((d) => d.id !== id) ?? null);
  };

  return (
    <>
      <TypeRows settings={settings} onChange={setSettings} pushOn={pushOn} />
      {pushOn && publicKey ? (
        <ThisDevice publicKey={publicKey} devices={shown} onChanged={refresh} />
      ) : (
        <Group>
          <p>Notifications on your phone and computer are coming soon.</p>
        </Group>
      )}
      {pushOn ? (
        <Devices
          devices={shown}
          onRemoveStart={startRemove}
          onRemoveEnd={endRemove}
        />
      ) : null}
    </>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="font-medium text-base text-fg">{children}</h3>;
}

/** One part of the section; each after the first sits under a hairline. */
function Group({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3 border-hairline not-first:border-t not-first:pt-4">
      {children}
    </div>
  );
}

function TypeRows({
  settings,
  onChange,
  pushOn,
}: {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  pushOn: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const save = async (next: NotificationSettings) => {
    const before = settings;
    onChange(next);
    setError(null);
    try {
      await notificationsApi.setSettings({ settings: next });
    } catch {
      onChange(before);
      setError(TRY_AGAIN);
    }
  };
  return (
    <Group>
      <SubHeading>What to send</SubHeading>
      <ul className="space-y-3">
        {TYPE_ROWS.map((row) => (
          <li key={row.type} className="space-y-2">
            <div>
              <div className="font-medium text-fg">{row.title}</div>
              <p className="text-sm">
                {row.detail}
                {row.sending ? null : (
                  <span className="text-muted"> Coming soon.</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NOTIFICATION_CHANNELS[row.type].map((channel) => (
                <ChannelSwitch
                  key={channel}
                  row={row}
                  channel={channel}
                  on={channelOn(settings, row.type, channel)}
                  available={row.sending && (channel !== "push" || pushOn)}
                  onToggle={(on) =>
                    void save(withChannel(settings, row.type, channel, on))
                  }
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="status" className="text-fg text-sm">
          {error}
        </p>
      ) : null}
    </Group>
  );
}

function ChannelSwitch({
  row,
  channel,
  on,
  available,
  onToggle,
}: {
  row: TypeRow;
  channel: Channel;
  on: boolean;
  available: boolean;
  onToggle: (on: boolean) => void;
}) {
  const words = CHANNEL_WORDS[channel];
  const Icon = channel === "push" ? Bell : Mail;
  const label = available
    ? `${on ? "Turn off" : "Turn on"} ${row.title.toLowerCase()} by ${words.toLowerCase()}`
    : "Coming soon";
  return (
    <WithTooltip label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={available && on}
        aria-disabled={!available}
        aria-label={`${row.title}: ${words}`}
        onClick={() => {
          if (available) onToggle(!on);
        }}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-hairline bg-panel px-2 text-fg text-sm transition-colors",
          available ? "hover:bg-hover" : "cursor-default text-muted",
        )}
      >
        <Icon size={13} aria-hidden="true" />
        {words}
        <Knob on={available && on} />
      </button>
    </WithTooltip>
  );
}

/** A switch's track and knob; the button around it is the control. */
function Knob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-0.5 transition-colors",
        on ? "bg-accent" : "bg-hairline-strong",
      )}
    >
      <span
        className={cn(
          "size-[14px] rounded-full bg-raised shadow-xs transition-transform",
          on && "translate-x-3 bg-accent-fg",
        )}
      />
    </span>
  );
}

function ThisDevice({
  publicKey,
  devices,
  onChanged,
}: {
  publicKey: string;
  devices: readonly PushDevice[];
  onChanged: () => Promise<void>;
}) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [working, setWorking] = useState<"on" | "off" | "test" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const onHere = devices.some((d) => d.current);

  useEffect(() => {
    setSupport(pushSupport());
    setPermission(notificationPermission());
  }, []);

  const turnOn = async () => {
    setWorking("on");
    setMessage(null);
    const result = await turnOnHere(publicKey);
    setPermission(notificationPermission());
    if (result === "on") {
      track("push_enabled", {});
      await onChanged();
    } else setMessage(TURN_ON_WORDS[result]);
    setWorking(null);
  };

  const turnOff = async () => {
    setWorking("off");
    setMessage(null);
    try {
      await turnOffHere();
      track("push_disabled", {});
      await onChanged();
    } catch {
      setMessage(TRY_AGAIN);
    }
    setWorking(null);
  };

  const sendTest = async () => {
    setWorking("test");
    setMessage(null);
    try {
      const result = await notificationsApi.test();
      setMessage(
        result.status === "sent"
          ? `Sent to ${result.devices === 1 ? "1 device" : `${result.devices} devices`}. It should show up in a few seconds.`
          : result.status === "no-devices"
            ? "Turn on notifications on a device first."
            : result.status === "off"
              ? "Notifications are turned off on Terpsicle for now."
              : "It didn't go through. Turn notifications off and on here, then try again.",
      );
      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof ApiCallError && error.reason === "rate-limited"
          ? "That's 10 tests this hour. Try again later."
          : TRY_AGAIN,
      );
    }
    setWorking(null);
  };

  let status: string;
  if (support === "ios-home-screen")
    status =
      "On iPhone, add Terpsicle to your Home Screen first: Share, then Add to Home Screen.";
  else if (support === "unsupported")
    status = "This browser can't get notifications from Terpsicle.";
  else if (onHere) status = "Notifications are on here.";
  else if (permission === "denied")
    status =
      "Your browser blocked notifications for Terpsicle. Allow them in its site settings, then try again.";
  else status = "Notifications are off here.";

  return (
    <Group>
      <SubHeading>This device</SubHeading>
      <p className={onHere ? "text-fg" : undefined}>{status}</p>
      <div className="flex flex-wrap gap-2">
        {support === "ok" && !onHere && permission !== "denied" ? (
          <WithTooltip label="Your browser asks first">
            <Button
              variant="outline"
              disabled={working !== null}
              onClick={() => void turnOn()}
            >
              {working === "on"
                ? "Turning on…"
                : "Turn on notifications on this device"}
            </Button>
          </WithTooltip>
        ) : null}
        {onHere ? (
          <WithTooltip label="Stops notifications here. Your other devices keep them.">
            <Button
              variant="outline"
              disabled={working !== null}
              onClick={() => void turnOff()}
            >
              {working === "off" ? "Turning off…" : "Turn off here"}
            </Button>
          </WithTooltip>
        ) : null}
        {devices.length > 0 ? (
          <WithTooltip label="Sends a notification to each of your devices">
            <Button
              variant="outline"
              disabled={working !== null}
              onClick={() => void sendTest()}
            >
              {working === "test" ? "Sending…" : "Send me a test"}
            </Button>
          </WithTooltip>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-fg text-sm">
          {message}
        </p>
      ) : null}
      <InstallAppSetting />
    </Group>
  );
}

/** How long Remove's Undo stays up before the server hears. */
const REMOVE_UNDO_MS = 6_000;

function Devices({
  devices,
  onRemoveStart,
  onRemoveEnd,
}: {
  devices: readonly PushDevice[];
  onRemoveStart: (id: string) => void;
  /** `removed`: the server heard; otherwise Undo, or it failed. */
  onRemoveEnd: (id: string, removed: boolean) => void;
}) {
  if (devices.length === 0) return null;
  // No confirmation (DESIGN §5): the row goes at once, and the server hears
  // once Undo's toast is gone, or as the page closes.
  const remove = (device: PushDevice) => {
    const name = device.label ?? "a device";
    let settled = false;
    const commit = (keepalive = false) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("pagehide", onHide);
      // A closing page still sends it.
      const fetcher: typeof fetch = (input, init) =>
        fetch(input, { ...init, keepalive });
      notificationsApi.remove({ id: device.id }, { fetcher }).then(
        () => onRemoveEnd(device.id, true),
        () => {
          if (keepalive) return;
          onRemoveEnd(device.id, false);
          toast(
            `Couldn't remove ${name}. Check your connection and try again.`,
          );
        },
      );
    };
    const onHide = () => commit(true);
    const undo = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("pagehide", onHide);
      onRemoveEnd(device.id, false);
      toast.dismiss(toastId);
    };
    const toastId = `push-remove-${device.id}`;
    onRemoveStart(device.id);
    window.addEventListener("pagehide", onHide);
    toast(`Removed ${name}`, {
      id: toastId,
      description: "It won't get notifications anymore.",
      duration: REMOVE_UNDO_MS,
      action: (
        <WithTooltip label="Put it back">
          <button
            type="button"
            onClick={undo}
            className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
          >
            Undo
          </button>
        </WithTooltip>
      ),
      onAutoClose: () => commit(),
      onDismiss: () => commit(),
    });
  };

  return (
    <Group>
      <SubHeading>Devices with notifications on</SubHeading>
      <ul className="space-y-2">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-fg">
                {device.label ?? "A device"}
              </div>
              <p className="text-sm">
                Added {addedOn(device.createdAt)}
                {device.current ? " · This device" : ""}
              </p>
            </div>
            <WithTooltip
              label={`Stops notifications on ${device.label ?? "this device"}`}
            >
              <Button variant="ghost" size="sm" onClick={() => remove(device)}>
                Remove
              </Button>
            </WithTooltip>
          </li>
        ))}
      </ul>
    </Group>
  );
}
