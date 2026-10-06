import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { signInStartHref } from "~/core/auth";
import { SIGN_IN_START_PATH } from "~/core/schema";
import { SitePage } from "~/features/site/site-page";
import {
  DataRow,
  YourDataSection,
} from "~/features/your-data/your-data-section";
import { track } from "~/lib/analytics";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { REMOVE_TOOLTIP, signOutFailure, useAccount } from "./account-store";
import { Avatar } from "./avatar";
import { SignInPanel } from "./sign-in-panel";

/** Where people change the name we show (we never edit it). */
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
 * seat (#watching, from the account menu), the way to notifications (§6.2,
 * their own page), and your data (download it, add a file back, delete the
 * account; DATA.md §5.6), signed in or not. A note page in the site's
 * frame, so every product is one click away.
 */
export function SettingsPage() {
  const status = useAccount((s) => s.status);
  const seatAlerts = useAccount((s) => s.flags.seatAlerts);
  const todo = useAccount((s) => s.flags.todo);
  return (
    <SitePage>
      <PageHeader
        title="Settings"
        status={
          status === "signed-in" ? "Signed in with your UMD account" : undefined
        }
      />
      <div
        aria-live="polite"
        aria-busy={status === "loading"}
        className="flex flex-col gap-6"
      >
        <PageSection title="Account">
          <AccountDetails />
        </PageSection>
        {status === "signed-in" ? (
          <PageSection title="Notifications">
            <WithTooltip label="Seat openings, Chat mentions and replies, Todo's Due tomorrow, and your devices">
              <Link
                to="/settings/notifications"
                className="-mx-2 block text-fg transition-colors hover:bg-hover"
              >
                <ListRow
                  className="px-2"
                  trail={
                    <ChevronRight
                      size={14}
                      aria-hidden="true"
                      className="text-muted"
                    />
                  }
                >
                  Choose what Terpsicle sends you, and where
                </ListRow>
              </Link>
            </WithTooltip>
          </PageSection>
        ) : null}
        {status === "signed-in" && seatAlerts ? (
          <Suspense fallback={null}>
            <SeatWatches />
          </Suspense>
        ) : null}
        {status === "loading" ? null : (
          <YourDataSection who={{ signedIn: status === "signed-in", todo }}>
            {status === "signed-in" ? <DeleteAccount /> : null}
          </YourDataSection>
        )}
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
    return <RowSkeleton rows={2} inset={false} label="Loading your account" />;

  if (status === "signed-in" && user)
    return (
      <div className="flex flex-col gap-3 text-muted">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <p data-private="" className="truncate font-medium text-fg">
              {user.name}
            </p>
            <p data-private="" className="truncate text-sm">
              {user.email}
            </p>
            <p data-private="" className="text-sm">
              Directory ID <span className="ident text-fg">{user.id}</span>
            </p>
          </div>
        </div>
        <p>
          Your name comes from your Google account. Change it there, then sign
          in again to update it. Terpsicle doesn't use your Google photo.{" "}
          <WithTooltip label="Opens Google's account page">
            <a
              href={GOOGLE_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
            >
              Google Account
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </WithTooltip>
        </p>
        <AccountActions />
      </div>
    );

  if (deleteAfter)
    return (
      <div className="flex flex-col gap-3 text-muted">
        <p className="text-fg">
          Your account will be deleted on {deletionDay(deleteAfter)}. Sign in
          before then to keep it.
        </p>
        <SignInPanel returnTo={SETTINGS_PATH} from="settings" pitch={false} />
      </div>
    );

  if (!signInOn)
    return <p className="text-muted">Signing in isn't available yet.</p>;

  return (
    <div className="flex flex-col gap-3 text-muted">
      <p>You're not signed in.</p>
      <SignInPanel returnTo={SETTINGS_PATH} from="settings" />
    </div>
  );
}

function AccountActions() {
  const signOut = useAccount((s) => s.signOut);
  const [working, setWorking] = useState<"sign-out" | "remove" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async (kind: "sign-out" | "remove") => {
    setWorking(kind);
    setFailed(null);
    try {
      const removeLocal = kind === "remove";
      await signOut({ removeLocal });
      track("signed_out", { removedLocal: removeLocal });
      if (removeLocal)
        noteToast("Signed out", {
          description:
            "Your plans are removed from this browser. They're still on your account.",
        });
    } catch (error) {
      setFailed(signOutFailure(error));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
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
      </div>
      {failed ? <InlineError message={failed} className="py-0" /> : null}
    </div>
  );
}

/**
 * "Delete your account", in Your data: no confirmation dialog (DESIGN §5).
 * The account waits a week, and Undo signs back in, which keeps it.
 */
function DeleteAccount() {
  const deleteAccount = useAccount((s) => s.deleteAccount);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setWorking(true);
    setFailed(false);
    try {
      const due = await deleteAccount();
      track("account_deletion_requested", {});
      undoToast({
        id: "account-delete",
        message: `Deleting your account on ${deletionDay(due)}`,
        description: "Undo signs you back in and keeps it.",
        tooltip: "Sign back in and keep your account",
        onUndo: () => {
          track("signin_started", { from: "undo" });
          window.location.assign(
            signInStartHref(SIGN_IN_START_PATH, SETTINGS_PATH),
          );
        },
      });
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <DataRow
      title="Delete your account"
      description="Signs you out everywhere, then waits a week: signing in before then keeps it. After that, your profile, synced plans, four-year plans, settings, Todo tasks, seat watches and chat messages are gone for good, and what was encrypted can't be read again, even from a backup. Reviews you posted stay up with no name on them. Plans in this browser stay."
      action={
        <WithTooltip label="Signs you out everywhere. The account goes after a week unless you sign in again.">
          <Button
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => void run()}
          >
            {working ? "Deleting…" : "Delete account"}
          </Button>
        </WithTooltip>
      }
    >
      {failed ? (
        <InlineError
          message="That didn't go through. Check your connection and try again."
          className="pb-0"
        />
      ) : null}
    </DataRow>
  );
}
