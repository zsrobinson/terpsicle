import { cn } from "cn";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { track } from "~/app/analytics";
import { Mark } from "~/app/brand/mark";
import type { MarkId } from "~/app/brand/marks";
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
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { Switch } from "~/ui/switch";
import { dismissToast, noteToast, undoToast } from "~/ui/toast";
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

// /settings/notifications (V2.md §6.2, §6.7): the switches grouped by
// product (Schedule, Chat, Todo), then "When and how" (quiet hours, seats
// through them, message text on the lock screen), then this device and
// the devices with notifications on. Each type's switches sit in two
// columns, Notification and Email, as the Settings artboard lays them out.
// Loaded only for someone signed in.

type Product = Extract<MarkId, "schedule" | "chat" | "todo">;

interface TypeRow {
  type: NotificationType;
  product: Product;
  title: string;
  detail: string;
  /**
   * What the Email column says for a type with no email switch: its email
   * comes in the digest, or it has none.
   */
  noEmail?: "digest";
  /**
   * Whether anything sends this type yet. Rows stay visible and quiet until
   * their feature calls `notify` (src/server/notifications/notify.ts).
   */
  sending: boolean;
}

export const TYPE_ROWS: readonly TypeRow[] = [
  {
    type: "seat-open",
    product: "schedule",
    title: "Seat openings",
    detail: "When a section you're watching gets an open seat.",
    sending: true,
  },
  {
    type: "chat-mention",
    product: "chat",
    title: "Mentions",
    detail: "When a classmate mentions you.",
    noEmail: "digest",
    sending: true,
  },
  {
    type: "chat-reply",
    product: "chat",
    title: "Replies to your threads",
    detail: "Muting a room stops these too.",
    noEmail: "digest",
    sending: true,
  },
  {
    type: "chat-digest",
    product: "chat",
    title: "Daily digest",
    detail: "Once a day, an email of mentions and replies you haven't read.",
    sending: true,
  },
  {
    type: "todo-due",
    product: "todo",
    title: "Due tomorrow",
    detail: "At 6pm, when something is due the next day.",
    sending: true,
  },
];

const PRODUCTS: readonly { id: Product; name: string }[] = [
  { id: "schedule", name: "Schedule" },
  { id: "chat", name: "Chat" },
  { id: "todo", name: "Todo" },
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
    "Notifications only work on terpsicle.com. If you're there, try again in a moment.",
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
  const [todoConnected, setTodoConnected] = useState(false);
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
      setTodoConnected(s.todoConnected === true);
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
      <InlineError
        message="Couldn't load your notification settings. Check your connection and try again."
        onRetry={() => void refresh()}
      />
    );
  if (!settings || !devices)
    return (
      <RowSkeleton rows={4} inset={false} label="Loading your notifications" />
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
      {PRODUCTS.map((product, i) => (
        <ProductRows
          key={product.id}
          product={product}
          columns={i === 0}
          settings={settings}
          onChange={setSettings}
          pushOn={pushOn}
          todoConnected={todoConnected}
        />
      ))}
      <WhenAndHow settings={settings} onChange={setSettings} pushOn={pushOn} />
      {pushOn && publicKey ? (
        <ThisDevice publicKey={publicKey} devices={shown} onChanged={refresh} />
      ) : (
        <PageSection title="This device">
          <p className="text-muted">
            Notifications on your phone and computer are coming soon.
          </p>
        </PageSection>
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

/**
 * Saves a change at once, and puts it back with a line saying so when the
 * server didn't take it. One per group of switches, so the line shows by
 * the switch that failed.
 */
function useSave(
  settings: NotificationSettings,
  onChange: (next: NotificationSettings) => void,
) {
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
  return { error, save };
}

/** The two columns' width: a switch, or a short word, centered in each. */
const COLUMNS =
  "grid grid-cols-[4.5rem_4.5rem] items-center gap-2 sm:grid-cols-[6rem_6rem]";

/** "Notification" and "Email" over the switch columns. */
function ColumnHeads() {
  return (
    <div aria-hidden="true" className={cn(COLUMNS, "text-center")}>
      <span>{CHANNEL_WORDS.push}</span>
      <span>{CHANNEL_WORDS.email}</span>
    </div>
  );
}

/** One row of switches: the words at the left, a cell per column. */
function SettingRow({
  title,
  detail,
  push,
  email,
}: {
  title: string;
  detail: ReactNode;
  push: ReactNode;
  email?: ReactNode;
}) {
  return (
    <ListRow
      as="li"
      className="px-0"
      secondary={detail}
      trail={
        <div className={COLUMNS}>
          <div className="flex justify-center">{push}</div>
          <div className="flex justify-center">{email}</div>
        </div>
      }
    >
      <div className="font-medium">{title}</div>
    </ListRow>
  );
}

/** A channel a type doesn't have: a quiet word, or a dash. */
function NoChannel({ words }: { words: string | null }) {
  return words ? (
    <span className="text-center text-muted text-xs">{words}</span>
  ) : (
    <span className="text-muted text-xs">
      <span aria-hidden="true">—</span>
      <span className="sr-only">None</span>
    </span>
  );
}

/** What seat openings do in quiet hours, after their detail. */
function seatQuietWords(settings: NotificationSettings): string {
  if (!settings.quietHours.on) return "";
  return settings.seatThroughQuiet
    ? " Comes through quiet hours."
    : " Waits for 8am in quiet hours.";
}

function ProductRows({
  product,
  columns,
  settings,
  onChange,
  pushOn,
  todoConnected,
}: {
  product: { id: Product; name: string };
  /** The first group carries the columns' names. */
  columns: boolean;
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  pushOn: boolean;
  /** "Due tomorrow" needs an ELMS feed in Todo (V3.md §4). */
  todoConnected: boolean;
}) {
  const { error, save } = useSave(settings, onChange);
  const rows = TYPE_ROWS.filter((row) => row.product === product.id);
  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          <Mark id={product.id} size={16} />
          {product.name}
        </span>
      }
      aside={columns ? <ColumnHeads /> : undefined}
    >
      <ul>
        {rows.map((row) => {
          const needsTodo = row.type === "todo-due" && !todoConnected;
          const cell = (channel: Channel) =>
            NOTIFICATION_CHANNELS[row.type].includes(channel) ? (
              <ChannelSwitch
                row={row}
                channel={channel}
                on={!needsTodo && channelOn(settings, row.type, channel)}
                available={
                  row.sending && !needsTodo && (channel !== "push" || pushOn)
                }
                unavailableWords={
                  needsTodo ? "Connect ELMS in Todo first" : undefined
                }
                onToggle={(on) =>
                  void save(withChannel(settings, row.type, channel, on))
                }
              />
            ) : (
              <NoChannel
                words={
                  channel === "email" && row.noEmail === "digest"
                    ? "In the digest"
                    : null
                }
              />
            );
          return (
            <SettingRow
              key={row.type}
              title={row.title}
              detail={
                <>
                  {row.detail}
                  {row.type === "seat-open" ? seatQuietWords(settings) : null}
                  {!row.sending ? (
                    <span> Coming soon.</span>
                  ) : needsTodo ? (
                    <span>
                      {" "}
                      <WithTooltip label="Open Todo's connect page">
                        <a
                          href="/todo/connect"
                          className="underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
                        >
                          Connect ELMS in Todo
                        </a>
                      </WithTooltip>{" "}
                      to get this.
                    </span>
                  ) : null}
                </>
              }
              push={cell("push")}
              email={cell("email")}
            />
          );
        })}
      </ul>
      {error ? <InlineError message={error} className="py-0" /> : null}
    </PageSection>
  );
}

/**
 * Quiet hours, seat openings through them, and message text on the lock
 * screen (V2.md §6.7). They shape pushes, so they sit in the Notification
 * column.
 */
function WhenAndHow({
  settings,
  onChange,
  pushOn,
}: {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  pushOn: boolean;
}) {
  const { error, save } = useSave(settings, onChange);
  const quiet = settings.quietHours.on;
  return (
    <PageSection title="When and how">
      <ul>
        <SettingRow
          title="Quiet hours, 11pm to 8am"
          detail="Notifications wait and arrive together at 8am."
          push={
            <SettingSwitch
              label="Quiet hours"
              on={quiet}
              available={pushOn}
              tooltip={
                quiet
                  ? "Turn off quiet hours: notifications come any time"
                  : "Turn on quiet hours: notifications wait until 8am"
              }
              onToggle={(on) => void save({ ...settings, quietHours: { on } })}
            />
          }
        />
        <SettingRow
          title="Seat openings come through"
          detail="A seat can be gone by morning, so these don't wait."
          push={
            <SettingSwitch
              label="Seat openings come through quiet hours"
              on={settings.seatThroughQuiet}
              available={pushOn && quiet}
              unavailableWords={
                pushOn ? "Quiet hours are off, so nothing waits" : undefined
              }
              tooltip={
                settings.seatThroughQuiet
                  ? "Hold seat openings until 8am too"
                  : "Let seat openings through quiet hours"
              }
              onToggle={(on) =>
                void save({ ...settings, seatThroughQuiet: on })
              }
            />
          }
        />
        <SettingRow
          title="Show message text"
          detail={`Off: "New mention in CMSC351", without the words, on your lock screen.`}
          push={
            <SettingSwitch
              label="Show message text"
              on={settings.showText}
              available={pushOn}
              tooltip={
                settings.showText
                  ? "Keep who and what off your lock screen"
                  : "Show who wrote and what they said"
              }
              onToggle={(on) => void save({ ...settings, showText: on })}
            />
          }
        />
      </ul>
      {error ? <InlineError message={error} className="py-0" /> : null}
    </PageSection>
  );
}

/** The kit's switch as a cell: just the track, named for its row. */
const CELL_SWITCH =
  "h-8 justify-center rounded-md px-2 max-md:h-11 max-md:w-full";

function SettingSwitch({
  label,
  on,
  available,
  unavailableWords = "Coming soon",
  tooltip,
  onToggle,
}: {
  /** The switch's name, for screen readers: the row's words. */
  label: string;
  on: boolean;
  available: boolean;
  /** The tooltip while it can't be switched. */
  unavailableWords?: string | undefined;
  /** The tooltip while it can: what pressing it does. */
  tooltip: string;
  onToggle: (on: boolean) => void;
}) {
  return (
    <WithTooltip label={available ? tooltip : unavailableWords}>
      <Switch
        checked={on}
        unavailable={!available}
        aria-label={label}
        onCheckedChange={onToggle}
        className={cn(CELL_SWITCH, available && "hover:bg-hover")}
      />
    </WithTooltip>
  );
}

function ChannelSwitch({
  row,
  channel,
  on,
  available,
  unavailableWords,
  onToggle,
}: {
  row: TypeRow;
  channel: Channel;
  on: boolean;
  available: boolean;
  /** The tooltip while it can't be switched. */
  unavailableWords?: string | undefined;
  onToggle: (on: boolean) => void;
}) {
  const words = CHANNEL_WORDS[channel];
  return (
    <SettingSwitch
      label={`${row.title}: ${words}`}
      on={on}
      available={available}
      unavailableWords={unavailableWords}
      tooltip={`${on ? "Turn off" : "Turn on"} ${row.title.toLowerCase()} by ${words.toLowerCase()}`}
      onToggle={onToggle}
    />
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
    <PageSection title="This device">
      <div>
        <p className={onHere ? "text-fg" : "text-muted"}>{status}</p>
        {devices.length > 0 ? (
          <p className="mt-0.5 text-muted text-sm">
            {devices.length === 1
              ? "1 device in all"
              : `${devices.length} devices in all`}
          </p>
        ) : null}
      </div>
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
      <div className="mt-2">
        <InstallAppSetting />
      </div>
    </PageSection>
  );
}

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
          noteToast(
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
      dismissToast(toastId);
    };
    const toastId = `push-remove-${device.id}`;
    onRemoveStart(device.id);
    window.addEventListener("pagehide", onHide);
    undoToast({
      id: toastId,
      message: `Removed ${name}`,
      description: "It won't get notifications anymore.",
      tooltip: "Put it back",
      onUndo: undo,
      onDone: () => commit(),
    });
  };

  return (
    <PageSection title="Devices with notifications on">
      <ul>
        {devices.map((device) => (
          <ListRow
            key={device.id}
            as="li"
            className="px-0"
            secondary={`Added ${addedOn(device.createdAt)}${device.current ? " · This device" : ""}`}
            action={
              <WithTooltip
                label={`Stops notifications on ${device.label ?? "this device"}`}
              >
                <Button
                  variant="ghost"
                  size="row"
                  onClick={() => remove(device)}
                >
                  Remove
                </Button>
              </WithTooltip>
            }
          >
            <div className="truncate">{device.label ?? "A device"}</div>
          </ListRow>
        ))}
      </ul>
    </PageSection>
  );
}
