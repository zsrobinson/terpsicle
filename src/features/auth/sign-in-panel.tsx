import { useState } from "react";
import { track } from "~/app/analytics";
import {
  SIGN_IN_PITCH,
  signInStartHref,
  TEST_USERS,
  UMD_ACCOUNTS_WORDS,
} from "~/core/auth";
import { SIGN_IN_START_PATH } from "~/core/schema";
import { api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { useAccount } from "./account-store";

export type SignInFrom = "topbar" | "settings" | "signin-page" | "undo";

/** Where a sign-in should come back to: this page. */
export function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

const buttonClass =
  "inline-flex h-9 w-full items-center justify-center gap-3 rounded-md border border-hairline-strong bg-raised px-3 font-medium text-base text-fg transition-colors hover:bg-hover";

/**
 * Google's "Sign in with Google" button, drawn with our tokens: Google's
 * branding rules ask for the standard multicolor "G" (never recolored) on a
 * white or neutral fill with a hairline, and the words "Sign in with
 * Google". The "G" is a file (public/google-g.svg) because its colors are
 * Google's, not tokens. It's a link: the start is a navigation. In test
 * mode it says so and leads to /auth/test instead (V2.md §4.6).
 */
export function GoogleButton({
  returnTo,
  from,
}: {
  returnTo: string;
  from: SignInFrom;
}) {
  const testMode = useAccount((s) => s.flags.authTestMode);
  const href = signInStartHref(SIGN_IN_START_PATH, returnTo);
  const onClick = () => track("signin_started", { from });
  if (testMode)
    return (
      <WithTooltip label="Pick a test person instead of a Google account">
        <a href={href} onClick={onClick} className={buttonClass}>
          Sign in (test mode)
        </a>
      </WithTooltip>
    );
  return (
    <WithTooltip label={`Use your ${UMD_ACCOUNTS_WORDS} account`}>
      <a href={href} onClick={onClick} className={buttonClass}>
        <img src="/google-g.svg" alt="" width={18} height={18} />
        Sign in with Google
      </a>
    </WithTooltip>
  );
}

/** The sign-in sheet's body: why, then the Google button. */
export function SignInPanel({
  returnTo,
  from,
  pitch = true,
}: {
  returnTo: string;
  from: SignInFrom;
  pitch?: boolean;
}) {
  return (
    <div className="space-y-3">
      {pitch ? <p className="text-fg">{SIGN_IN_PITCH}</p> : null}
      <GoogleButton returnTo={returnTo} from={from} />
      <p className="text-muted text-sm">
        Use your {UMD_ACCOUNTS_WORDS} account. We see your name, email and
        photo, never your mail or files.
      </p>
    </div>
  );
}

/**
 * `/auth/test`'s list, test mode's stand-in for Google (previews, `pnpm
 * dev:mock`, e2e): pick a fixture person. Labeled plainly so nobody takes
 * it for the real thing.
 */
export function TestSignIn({ returnTo }: { returnTo: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const signInAs = async (userId: string) => {
    setBusy(userId);
    setFailed(false);
    try {
      const result = await api.auth.testSignIn({ userId, return: returnTo });
      if (result.status === "signed-in") {
        window.location.assign(result.return);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(null);
  };
  return (
    <div className="space-y-3">
      <p className="text-muted">
        This is a test copy of Terpsicle. Pick a test person; real Google
        accounts can't sign in here.
      </p>
      <div className="flex flex-col gap-1.5">
        {TEST_USERS.map(({ identity, isAdmin }) => (
          <WithTooltip
            key={identity.directoryId}
            label={`Sign in as ${identity.directoryId}${isAdmin ? " (an admin)" : ""}`}
          >
            <Button
              variant="outline"
              className="justify-start"
              disabled={busy !== null}
              onClick={() => void signInAs(identity.directoryId)}
            >
              {busy === identity.directoryId
                ? "Signing in…"
                : `Sign in as ${identity.name}`}
            </Button>
          </WithTooltip>
        ))}
      </div>
      {failed ? (
        <p role="status" className="text-fg text-sm">
          That didn't work. Try again.
        </p>
      ) : null}
    </div>
  );
}
