import { useAccount } from "~/features/auth/account-store";
import { SignInPanel } from "~/features/auth/sign-in-panel";
import { SitePage } from "~/features/site/site-page";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { NotificationSettingsSection } from "./notification-settings";

export const NOTIFICATIONS_PATH = "/settings/notifications";

/**
 * `/settings/notifications` (V2.md §6.2). Signed in only. A note page in the
 * site's frame, like /settings, with Back to it.
 */
export function NotificationsPage() {
  const status = useAccount((s) => s.status);
  const signInOn = useAccount((s) => s.flags.signIn);
  return (
    <SitePage>
      <PageHeader
        title="Notifications"
        back={{ label: "Settings", to: "/settings" }}
      />
      <div
        aria-live="polite"
        aria-busy={status === "loading"}
        className="flex flex-col gap-6"
      >
        {status === "loading" ? (
          <RowSkeleton
            rows={4}
            inset={false}
            label="Loading your notifications"
          />
        ) : status === "signed-in" ? (
          <NotificationSettingsSection />
        ) : signInOn ? (
          <PageSection title="Sign in first">
            <div className="flex flex-col gap-3 text-muted">
              <p>
                Notifications go to your account, so sign in to choose them.
              </p>
              <SignInPanel returnTo={NOTIFICATIONS_PATH} from="settings" />
            </div>
          </PageSection>
        ) : (
          <p className="text-muted">Signing in isn't available yet.</p>
        )}
      </div>
    </SitePage>
  );
}
