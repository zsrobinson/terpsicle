import {
  Bell,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ThemeMenuItems } from "~/components/theme-toggle";
import { signInPitch, signInStartHref } from "~/core/auth";
import { type MeUser, SIGN_IN_START_PATH } from "~/core/schema";
import { InstallAppMenuItem } from "~/features/pwa/install-entry";
import { SyncStatusLine } from "~/features/sync/status-view";
import { track } from "~/lib/analytics";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuSeparator,
  ActionMenuText,
  usePhoneMenus,
} from "~/ui/action-menu";
import { REMOVE_TOOLTIP, signOutFailure, useAccount } from "./account-store";
import { Avatar } from "./avatar";
import { currentPath } from "./sign-in-panel";

/**
 * The account entry at the right end of every page's bar (V2.md §1.1,
 * docs/COHESION.md): the avatar when signed in, a quiet "Sign in" when
 * not, and nothing while /api/me loads or where signing in is off. One menu
 * at every size, the kit's ActionMenu (a sheet on phones): the account (or
 * Sign in), then the theme and Install, then `items` (on phones, "Send
 * feedback"). Sign-in is invited, never required.
 * `fallback` shows while there's no menu (the theme toggle), so the theme
 * is always one click away.
 */
export function AccountButton({
  compact = false,
  fallback = null,
  items = null,
  note = null,
}: {
  compact?: boolean;
  fallback?: ReactNode;
  /** More items at the end of the menu (on phones, "Send feedback"). */
  items?: ReactNode;
  /**
   * Something in the menu waiting to be seen ("3 unread notifications",
   * when a phone's bar has no room for the bell): a dot on the avatar,
   * and these words after its name.
   */
  note?: string | null;
}) {
  const shown = useAccountButtonShown();
  if (!shown) return fallback;
  return <AccountMenu compact={compact} items={items} note={note} />;
}

/** Whether the account button (or, on phones, its menu) is showing. */
export function useAccountButtonShown(): boolean {
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  return (
    (status === "signed-in" && user !== null) ||
    (status === "signed-out" && signIn)
  );
}

const triggerClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg";

function AccountMenu({
  compact,
  items,
  note,
}: {
  compact: boolean;
  items: ReactNode;
  note: string | null;
}) {
  const user = useAccount((s) => s.user);
  return (
    <ActionMenu
      title={user ? "Account" : "Sign in"}
      tooltip={user ? "Your account and theme" : signInPitch(pagePathname())}
      align="end"
      className="w-[260px]"
      trigger={
        user ? (
          <button
            type="button"
            aria-label={
              note ? `Account: ${user.name}, ${note}` : `Account: ${user.name}`
            }
            className={`${triggerClass} relative px-1.5`}
          >
            <Avatar name={user.name} />
            {note ? (
              <span
                aria-hidden="true"
                data-testid="account-note"
                className="absolute top-0.5 right-0.5 size-2 rounded-full bg-fg ring-2 ring-bg"
              />
            ) : null}
          </button>
        ) : compact ? (
          <button
            type="button"
            aria-label="Sign in"
            className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg max-[380px]:size-7"
          >
            <LogIn size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={triggerClass}>
            <LogIn size={14} aria-hidden="true" />
            Sign in
          </button>
        )
      }
    >
      {user ? <AccountItems user={user} /> : <SignInItems />}
      <ActionMenuSeparator />
      <ThemeMenuItems />
      <InstallAppMenuItem />
      {items}
    </ActionMenu>
  );
}

/**
 * The page's pathname, for the pitch. The bar re-renders as the route
 * changes; on the server there's no page yet, and the pitch only shows once
 * the menu or its tooltip opens.
 */
function pagePathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

/** The menu's sign-in: this product's pitch, then the Google (or test mode) link. */
function SignInItems() {
  const testMode = useAccount((s) => s.flags.authTestMode);
  const phone = usePhoneMenus();
  return (
    <>
      <ActionMenuText>
        {/* A phone's sheet is headed by the menu's title already. */}
        {phone ? null : (
          <span className="block pb-0.5 font-medium text-fg">Sign in</span>
        )}
        {signInPitch(pagePathname())}
      </ActionMenuText>
      <ActionMenuLinkItem
        icon={
          testMode ? (
            <LogIn aria-hidden="true" className="text-muted" />
          ) : (
            <img src="/google-g.svg" alt="" width={16} height={16} />
          )
        }
        render={
          <a
            href={signInStartHref(SIGN_IN_START_PATH, currentPath())}
            onClick={() => track("signin_started", { from: "topbar" })}
          />
        }
      >
        {testMode ? "Sign in (test mode)" : "Sign in with Google"}
      </ActionMenuLinkItem>
    </>
  );
}

/** Who's signed in, then Settings, Admin (admins) and the two sign-outs. */
function AccountItems({ user }: { user: MeUser }) {
  const signOut = useAccount((s) => s.signOut);
  const seatAlerts = useAccount((s) => s.flags.seatAlerts);
  const [failed, setFailed] = useState<string | null>(null);
  const run = (removeLocal: boolean) => {
    setFailed(null);
    signOut({ removeLocal })
      .then(() => track("signed_out", { removedLocal: removeLocal }))
      .catch((error: unknown) => setFailed(signOutFailure(error)));
  };
  return (
    <>
      <ActionMenuText className="flex items-center gap-2 py-2">
        <Avatar name={user.name} />
        <span className="min-w-0">
          <span
            data-private=""
            className="block truncate font-medium text-base text-fg"
          >
            {user.name}
          </span>
          <span data-private="" className="block truncate text-muted text-sm">
            {user.email}
          </span>
        </span>
      </ActionMenuText>
      <SyncStatusLine />
      <ActionMenuSeparator />
      <ActionMenuLinkItem
        href="/settings"
        icon={<Settings aria-hidden="true" className="text-muted" />}
      >
        Settings
      </ActionMenuLinkItem>
      {seatAlerts ? (
        <ActionMenuLinkItem
          href="/settings#watching"
          tooltip="The sections you're watching for a seat"
          icon={<Bell aria-hidden="true" className="text-muted" />}
        >
          Watching for a seat
        </ActionMenuLinkItem>
      ) : null}
      {user.isAdmin ? (
        <ActionMenuLinkItem
          href="/admin"
          icon={<ShieldCheck aria-hidden="true" className="text-muted" />}
        >
          Admin
        </ActionMenuLinkItem>
      ) : null}
      <ActionMenuItem
        keepOpen
        tooltip="Your plans stay on this device"
        icon={<LogOut aria-hidden="true" className="text-muted" />}
        onSelect={() => run(false)}
      >
        Sign out
      </ActionMenuItem>
      <ActionMenuItem
        keepOpen
        tooltip={REMOVE_TOOLTIP}
        icon={<Trash2 aria-hidden="true" className="text-muted" />}
        onSelect={() => run(true)}
      >
        Sign out and remove plans from this device
      </ActionMenuItem>
      {failed ? (
        <ActionMenuText className="max-w-[240px]">
          <p role="status">{failed}</p>
        </ActionMenuText>
      ) : null}
    </>
  );
}
