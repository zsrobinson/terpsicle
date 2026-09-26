import { LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { track } from "~/app/analytics";
import { ThemeMenuItems } from "~/app/theme-toggle";
import { SIGN_IN_PITCH, signInStartHref } from "~/core/auth";
import { type MeUser, SIGN_IN_START_PATH } from "~/core/schema";
import { InstallAppMenuItem } from "~/features/pwa/install-entry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import { useAccount } from "./account-store";
import { Avatar } from "./avatar";
import { currentPath, SignInPanel } from "./sign-in-panel";

/**
 * The top bar's account entry (V2.md §1.1): a quiet "Sign in" when signed
 * out, the avatar and its menu when signed in, and nothing while /api/me
 * loads or where signing in is off. Sign-in is invited, never required.
 *
 * On phones the top bar has no room for another button next to the theme
 * toggle (the plan's name would shrink below a tappable size), so one
 * button does both: its menu has the account (or Sign in) and the theme.
 * `themeToggle` shows until then, and wherever sign-in is off.
 */
export function AccountButton({
  compact = false,
  themeToggle = null,
}: {
  compact?: boolean;
  themeToggle?: ReactNode;
}) {
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  const shown =
    (status === "signed-in" && user !== null) ||
    (status === "signed-out" && signIn);
  if (!shown) return themeToggle;
  if (compact) return <PhoneMenu />;
  return user ? <AccountMenu user={user} /> : <SignInButton />;
}

const triggerClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg";

function SignInButton() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label={SIGN_IN_PITCH} side="bottom">
        <PopoverTrigger asChild>
          <button type="button" className={triggerClass}>
            <LogIn size={14} aria-hidden="true" />
            Sign in
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent align="end" className="w-[300px]">
        <h2 className="mb-2 font-semibold text-lg tracking-tight">Sign in</h2>
        {open ? <SignInPanel returnTo={currentPath()} from="topbar" /> : null}
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu({ user }: { user: MeUser }) {
  return (
    <DropdownMenu>
      <WithTooltip label="Your account" side="bottom">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account: ${user.name}`}
            className={`${triggerClass} px-1.5`}
          >
            <Avatar name={user.name} src={user.avatarUrl} />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="w-[240px]">
        <AccountItems user={user} />
        <InstallAppMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phones: one button for the account (or Sign in) and the theme. */
function PhoneMenu() {
  const user = useAccount((s) => s.user);
  return (
    <DropdownMenu>
      <WithTooltip
        label={user ? "Your account and theme" : SIGN_IN_PITCH}
        side="bottom"
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={user ? `Account: ${user.name}` : "Sign in"}
            className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-[380px]:size-7"
          >
            {user ? (
              <Avatar name={user.name} src={user.avatarUrl} />
            ) : (
              <LogIn size={15} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent side="bottom" align="end" className="w-[260px]">
        {user ? <AccountItems user={user} /> : <SignInItems />}
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <InstallAppMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone menu's sign-in: the pitch, then the Google (or test mode) link. */
function SignInItems() {
  const testMode = useAccount((s) => s.flags.authTestMode);
  return (
    <>
      <DropdownMenuLabel>Sign in</DropdownMenuLabel>
      <p className="px-2 pb-2 text-muted text-sm">{SIGN_IN_PITCH}</p>
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

/** Who's signed in, then Settings, Admin (admins) and Sign out. */
function AccountItems({ user }: { user: MeUser }) {
  const signOut = useAccount((s) => s.signOut);
  const [failed, setFailed] = useState(false);
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
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <a href="/settings">
          <Settings aria-hidden="true" className="text-muted" />
          Settings
        </a>
      </DropdownMenuItem>
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
            setFailed(false);
            signOut()
              .then(() => track("signed_out", { removedLocal: false }))
              .catch(() => setFailed(true));
          }}
        >
          <LogOut aria-hidden="true" className="text-muted" />
          Sign out
        </DropdownMenuItem>
      </WithTooltip>
      {failed ? (
        <p role="status" className="px-2 py-1.5 text-muted text-sm">
          Couldn't sign out. Check your connection and try again.
        </p>
      ) : null}
    </>
  );
}
