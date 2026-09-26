import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { track } from "~/app/analytics";
import { signInStartHref } from "~/core/auth";
import { SIGN_IN_START_PATH } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { Avatar } from "~/features/auth/avatar";
import { WithTooltip } from "~/ui/tooltip";

// The account's corner on Reviews' pages: "Sign in" straight to Google (or
// test mode), or your picture, leading to Settings. Lighter than the
// scheduler's account menu: no menus to load, so Reviews and the scheduler
// share less code and each stays small (scripts/check-bundle.ts). Nothing
// shows until /api/me answers, or where signing in is off.

const linkClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg";

export function AccountLink() {
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  // The page's own path, once in the browser: where a sign-in comes back to.
  const [here, setHere] = useState("/reviews");
  useEffect(() => {
    const { pathname, search } = window.location;
    setHere(`${pathname}${search}`);
  }, []);

  if (status === "signed-in" && user)
    return (
      <WithTooltip label="Your account and settings">
        <a
          href="/settings"
          aria-label={`Account: ${user.name}`}
          className={`${linkClass} px-1.5`}
        >
          <Avatar name={user.name} src={user.avatarUrl} />
        </a>
      </WithTooltip>
    );
  if (status !== "signed-out" || !signIn) return null;
  return (
    <WithTooltip label="Sign in with your UMD account to write and report reviews">
      <a
        href={signInStartHref(SIGN_IN_START_PATH, here)}
        onClick={() => track("signin_started", { from: "reviews" })}
        className={linkClass}
      >
        <LogIn size={14} aria-hidden="true" />
        Sign in
      </a>
    </WithTooltip>
  );
}
