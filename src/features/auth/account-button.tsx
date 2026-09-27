import {
  Bell,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { track } from "~/app/analytics";
import { ThemeMenuItems } from "~/app/theme-toggle";
import { signInPitch, signInStartHref } from "~/core/auth";
import { type MeUser, SIGN_IN_START_PATH } from "~/core/schema";
import { InstallAppMenuItem } from "~/features/pwa/install-entry";
import { SyncStatusLine } from "~/features/sync/status-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { REMOVE_TOOLTIP, signOutFailure, useAccount } from "./account-store";
import { Avatar } from "./avatar";
import { currentPath } from "./sign-in-panel";

/**
 * The account entry at the right end of every page's bar (V2.md §1.1,
 * docs/COHESION.md): the avatar when signed in, a quiet "Sign in" when
 * not, and nothing while /api/me loads or where signing in is off. One menu
 * at every size: the account (or Sign in), then the theme and Install, then
 * `items` (on phones, "Send feedback"). Sign-in is invited, never required.
 * `fallback` shows while there's no menu (the theme toggle), so the theme
 * is always one click away.
 */
export function AccountButton({
  compact = false,
  fallback = null,
  items = null,
}: {
  compact?: boolean;
  fallback?: ReactNode;
  /** More items at the end of the menu (on phones, "Send feedback"). */
  items?: ReactNode;
}) {
  const shown = useAccountButtonShown();
  if (!shown) return fallback;
  return <AccountMenu compact={compact} items={items} />;
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
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg";

function AccountMenu({
  compact,
  items,
}: {
  compact: boolean;
  items: ReactNode;
}) {
  const user = useAccount((s) => s.user);
  return (
    <DropdownMenu>
      <WithTooltip
        label={user ? "Your account and theme" : signInPitch(pagePathname())}
        side="bottom"
      >
        <DropdownMenuTrigger asChild>
          {user ? (
            <button
              type="button"
              aria-label={`Account: ${user.name}`}
              className={`${triggerClass} px-1.5`}
            >
              <Avatar name={user.name} src={user.avatarUrl} />
            </button>
          ) : compact ? (
            <button
              type="button"
              aria-label="Sign in"
              className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-[380px]:size-7"
            >
              <LogIn size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={triggerClass}>
              <LogIn size={14} aria-hidden="true" />
              Sign in
            </button>
          )}
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent side="bottom" align="end" className="w-[260px]">
        {user ? <AccountItems user={user} /> : <SignInItems />}
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <InstallAppMenuItem />
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <>
      <DropdownMenuLabel>Sign in</DropdownMenuLabel>
      <p className="px-2 pb-2 text-muted text-sm">
        {signInPitch(pagePathname())}
      </p>
      <DropdownMenuItem asChild>
        <a
          href={signInStartHref(SIGN_IN_START_PATH, currentPath())}
          onClick={() => track("signin_started", { from: "topbar" })}
        >
          {testMode ? (
            <LogIn aria-hidden="true" className="text-muted" />
          ) : (
            <img src="/google-g.svg" alt="" width={16} height={16} />
          )}
          {testMode ? "Sign in (test mode)" : "Sign in with Google"}
        </a>
      </DropdownMenuItem>
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
      <DropdownMenuLabel className="flex items-center gap-2 py-2">
        <Avatar name={user.name} src={user.avatarUrl} />
        <span className="min-w-0">
          <span
            data-private=""
            className="block truncate font-medium text-base text-fg"
          >
            {user.name}
          </span>
          <span
            data-private=""
            className="block truncate font-normal text-muted text-sm"
          >
            {user.email}
          </span>
        </span>
      </DropdownMenuLabel>
      <SyncStatusLine />
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <a href="/settings">
          <Settings aria-hidden="true" className="text-muted" />
          Settings
        </a>
      </DropdownMenuItem>
      {seatAlerts ? (
        <WithTooltip
          label="The sections you're watching for a seat"
          side="left"
        >
          <DropdownMenuItem asChild>
            <a href="/settings#watching">
              <Bell aria-hidden="true" className="text-muted" />
              Watching for a seat
            </a>
          </DropdownMenuItem>
        </WithTooltip>
      ) : null}
      {user.isAdmin ? (
        <DropdownMenuItem asChild>
          <a href="/admin">
            <ShieldCheck aria-hidden="true" className="text-muted" />
            Admin
          </a>
        </DropdownMenuItem>
      ) : null}
      <WithTooltip label="Your plans stay on this device" side="left">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            run(false);
          }}
        >
          <LogOut aria-hidden="true" className="text-muted" />
          Sign out
        </DropdownMenuItem>
      </WithTooltip>
      <WithTooltip label={REMOVE_TOOLTIP} side="left">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            run(true);
          }}
        >
          <Trash2 aria-hidden="true" className="text-muted" />
          Sign out and remove plans from this device
        </DropdownMenuItem>
      </WithTooltip>
      {failed ? (
        <p
          role="status"
          className="max-w-[240px] px-2 py-1.5 text-muted text-sm"
        >
          {failed}
        </p>
      ) : null}
    </>
  );
}
