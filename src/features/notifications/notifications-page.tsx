import { ChevronLeft } from "lucide-react";
import { AccountPage, AccountSection } from "~/features/auth/account-page";
import { useAccount } from "~/features/auth/account-store";
import { SignInPanel } from "~/features/auth/sign-in-panel";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { NotificationSettingsSection } from "./notification-settings";

export const NOTIFICATIONS_PATH = "/settings/notifications";

/** `/settings/notifications` (V2.md §6.2). Signed in only. */
export function NotificationsPage() {
  const status = useAccount((s) => s.status);
  const signInOn = useAccount((s) => s.flags.signIn);
  return (
    <AccountPage title="Notifications" busy={status === "loading"}>
      <WithTooltip label="Back to your account settings">
        <a
          href="/settings"
          className="-mt-2 inline-flex items-center gap-1 text-muted text-sm underline-offset-4 hover:text-fg hover:underline"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Settings
        </a>
      </WithTooltip>
      {status === "loading" ? (
        <Skeleton className="h-40 w-full" />
      ) : status === "signed-in" ? (
        <AccountSection title="Your notifications">
          <NotificationSettingsSection />
        </AccountSection>
      ) : signInOn ? (
        <AccountSection title="Sign in first">
          <p>Notifications go to your account, so sign in to choose them.</p>
          <SignInPanel returnTo={NOTIFICATIONS_PATH} from="settings" />
        </AccountSection>
      ) : (
        <p>Signing in isn't available yet.</p>
      )}
    </AccountPage>
  );
}
