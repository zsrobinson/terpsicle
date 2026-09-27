import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { track } from "~/app/analytics";
import { signInStartHref } from "~/core/auth";
import { SIGN_IN_START_PATH } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { useAccount } from "./account-store";
import { Avatar } from "./avatar";

// The account's corner in the site header (Reviews, Settings): "Sign in"
// straight to Google (or test mode), or your picture, leading to Settings.
// Lighter than the scheduler's account menu: no menus to load, so these
// pages and the scheduler share less code and each stays small
// (scripts/check-bundle.ts). Nothing shows until /api/me answers, or where
// signing in is off.

const SETTINGS_PATH = "/settings";

/** Where a sign-in returns before the page knows its own path. */
const FALLBACK = { reviews: "/reviews", settings: SETTINGS_PATH } as const;

const linkClass =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-base text-muted transition-colors hover:bg-hover hover:text-fg aria-[current=page]:bg-hover aria-[current=page]:text-fg";

export function AccountLink({
  from,
  signInTip,
}: {
  /** Where a sign-in started, for `signin_started`. */
  from: "reviews" | "settings";
  /** What signing in gets you here. */
  signInTip: string;
}) {
  const status = useAccount((s) => s.status);
  const signIn = useAccount((s) => s.flags.signIn);
  const user = useAccount((s) => s.user);
  // The page's own path, once in the browser: where a sign-in comes back to.
  const [here, setHere] = useState<string>(FALLBACK[from]);
  useEffect(() => {
    const { pathname, search } = window.location;
    setHere(`${pathname}${search}`);
  }, []);
  const onSettings = here.split("?")[0] === SETTINGS_PATH;

  if (status === "signed-in" && user)
    return (
      <WithTooltip label="Your account and settings">
        <a
          href={SETTINGS_PATH}
          aria-label={`Account: ${user.name}`}
          aria-current={onSettings ? "page" : undefined}
          className={`${linkClass} px-1.5`}
        >
          <Avatar name={user.name} src={user.avatarUrl} />
        </a>
      </WithTooltip>
    );
  if (status !== "signed-out" || !signIn) return null;
  return (
    <WithTooltip label={signInTip}>
      <a
        href={signInStartHref(SIGN_IN_START_PATH, here)}
        onClick={() => track("signin_started", { from })}
        className={linkClass}
      >
        <LogIn size={14} aria-hidden="true" />
        Sign in
      </a>
    </WithTooltip>
  );
}
