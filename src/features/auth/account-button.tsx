import { LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { track } from "~/app/analytics";
import { SIGN_IN_PITCH } from "~/core/auth";
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
 * out, the avatar and its menu when signed in, and nothing at all while
 * /api/me loads or where signing in is off. Sign-in is invited, never
 * required: the scheduler works fully signed out.
 */
export function AccountButton({ compact = false }: { compact?: boolean }) {
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  if (status === "signed-in" && user) return <AccountMenu compact={compact} />;
  if (status !== "signed-out" || !signIn) return null;
  return <SignInButton compact={compact} />;
}

const triggerClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg";

function SignInButton({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label={SIGN_IN_PITCH} side="bottom">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={compact ? `${triggerClass} px-1.5` : triggerClass}
            aria-label={compact ? "Sign in" : undefined}
          >
            <LogIn size={14} aria-hidden="true" />
            {compact ? null : "Sign in"}
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

function AccountMenu({ compact }: { compact: boolean }) {
  const user = useAccount((s) => s.user);
  const signOut = useAccount((s) => s.signOut);
  const [failed, setFailed] = useState(false);
  if (!user) return null;
  return (
    <DropdownMenu onOpenChange={(open) => open && setFailed(false)}>
      <WithTooltip label="Your account" side="bottom">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account: ${user.name}`}
            className={`${triggerClass} ${compact ? "px-1" : "px-1.5"}`}
          >
            <Avatar name={user.name} src={user.avatarUrl} />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="w-[240px]">
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
        <DropdownMenuSeparator />
        <WithTooltip label="Your plans stay on this device" side="left">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
