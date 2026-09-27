import { ChevronRight, ExternalLink } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { track } from "~/app/analytics";
import { SIGN_IN_PITCH, signInStartHref } from "~/core/auth";
import { SIGN_IN_START_PATH } from "~/core/schema";
import { SitePage } from "~/features/site/site-page";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { AccountLink } from "./account-link";
import { AccountSection } from "./account-page";
import { REMOVE_TOOLTIP, signOutFailure, useAccount } from "./account-store";
import { Avatar } from "./avatar";
import { SignInPanel } from "./sign-in-panel";

/** Where people change the name and photo we show (we never edit them). */
export const GOOGLE_PROFILE_URL = "https://myaccount.google.com/personal-info";

const SETTINGS_PATH = "/settings";

// Signed-in only, so the page's first load doesn't carry it.
const SeatWatches = lazy(() =>
  import("~/features/alerts/settings-section").then((m) => ({
    default: m.SeatWatchesSection,
  })),
);

/** "Saturday, October 3" in the reader's time zone. */
export function deletionDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * `/settings`: the account (V2.md §1.1), the sections you're watching for a
 * seat (#watching, from the account menu), and the way to notifications
 * (§6.2, their own page). It sits in the site's frame, so every product is
 * one click away.
 */
export function SettingsPage() {
  const status = useAccount((s) => s.status);
  const seatAlerts = useAccount((s) => s.flags.seatAlerts);
  return (
    <SitePage
      layout="reading"
      actions={<AccountLink from="settings" signInTip={SIGN_IN_PITCH} />}
    >
      <h1 className="mb-4 font-semibold text-xl tracking-tight">Settings</h1>
      <div
        aria-live="polite"
        aria-busy={status === "loading"}
        className="space-y-4"
      >
        <AccountSection title="Account">
          <AccountDetails />
        </AccountSection>
        {status === "signed-in" ? (
          <AccountSection title="Notifications">
            <WithTooltip label="Seat openings, Chat mentions and Todo reminders, and your devices">
              <a
                href="/settings/notifications"
                className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1 text-fg transition-colors hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  Choose what Terpsicle sends you, and where
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            </WithTooltip>
          </AccountSection>
        ) : null}
        {status === "signed-in" && seatAlerts ? (
          <Suspense fallback={null}>
            <SeatWatches />
          </Suspense>
        ) : null}
      </div>
    </SitePage>
  );
}

function AccountDetails() {
  const status = useAccount((s) => s.status);
  const signInOn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  const deleteAfter = useAccount((s) => s.deleteAfter);

  if (status === "loading")
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );

  if (status === "signed-in" && user)
    return (
      <>
        <div className="flex items-center gap-3">
          <Avatar name={user.name} src={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p data-private="" className="truncate font-medium text-fg">
              {user.name}
            </p>
            <p data-private="" className="truncate">
              {user.email}
            </p>
            <p data-private="">
              Directory ID <span className="ident text-fg">{user.id}</span>
            </p>
          </div>
        </div>
        <p>
          Your name and photo come from your Google account. Change them there,
          then sign in again to update them.{" "}
          <WithTooltip label="Opens Google's account page">
            <a
              href={GOOGLE_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-fg underline-offset-4 hover:underline"
            >
              Google Account
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </WithTooltip>
        </p>
        <AccountActions />
      </>
    );

  if (deleteAfter)
    return (
      <>
        <p className="text-fg">
          Your account will be deleted on {deletionDay(deleteAfter)}. Sign in
          before then to keep it.
        </p>
        <SignInPanel returnTo={SETTINGS_PATH} from="settings" pitch={false} />
      </>
    );

  if (!signInOn) return <p>Signing in isn't available yet.</p>;

  return (
    <>
      <p>You're not signed in.</p>
      <SignInPanel returnTo={SETTINGS_PATH} from="settings" />
    </>
  );
}

function AccountActions() {
  const signOut = useAccount((s) => s.signOut);
  const deleteAccount = useAccount((s) => s.deleteAccount);
  const [working, setWorking] = useState<
    "sign-out" | "remove" | "delete" | null
  >(null);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async (kind: "sign-out" | "remove" | "delete") => {
    setWorking(kind);
    setFailed(null);
    try {
      if (kind !== "delete") {
        const removeLocal = kind === "remove";
        await signOut({ removeLocal });
        track("signed_out", { removedLocal: removeLocal });
        if (removeLocal)
          toast("Signed out", {
            description:
              "Your plans are removed from this browser. They're still on your account.",
          });
      } else {
        const due = await deleteAccount();
        track("account_deletion_requested", {});
        // No confirmation dialog (DESIGN §5): Undo signs back in, which
        // keeps the account.
        toast(`Deleting your account on ${deletionDay(due)}`, {
          description: "Undo signs you back in and keeps it.",
          duration: 10_000,
          action: {
            label: "Undo",
            onClick: () => {
              track("signin_started", { from: "undo" });
              window.location.assign(
                signInStartHref(SIGN_IN_START_PATH, SETTINGS_PATH),
              );
            },
          },
        });
      }
    } catch (error) {
      setFailed(
        kind === "delete"
          ? "That didn't go through. Check your connection and try again."
          : signOutFailure(error),
      );
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <WithTooltip label="Your plans stay on this device">
          <Button
            variant="outline"
            disabled={working !== null}
            onClick={() => void run("sign-out")}
          >
            {working === "sign-out" ? "Signing out…" : "Sign out"}
          </Button>
        </WithTooltip>
        <WithTooltip label={REMOVE_TOOLTIP}>
          <Button
            variant="outline"
            disabled={working !== null}
            onClick={() => void run("remove")}
          >
            {working === "remove"
              ? "Saving and removing…"
              : "Sign out and remove plans from this device"}
          </Button>
        </WithTooltip>
        <WithTooltip label="Signs you out everywhere. The account goes after a week unless you sign in again.">
          <Button
            variant="ghost"
            disabled={working !== null}
            onClick={() => void run("delete")}
          >
            {working === "delete" ? "Deleting…" : "Delete account"}
          </Button>
        </WithTooltip>
      </div>
      <p className="text-sm">
        Deleting signs you out everywhere. After a week, your profile, synced
        plans, chat messages and ELMS feed are gone for good. Your published
        reviews stay up, with no name on them. Delete them first if you want
        them gone. Plans on this device stay.
      </p>
      {failed ? (
        <p role="status" className="text-fg text-sm">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
