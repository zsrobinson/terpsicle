import { useEffect } from "react";
import { track } from "~/app/analytics";
import { safeReturnPath, signInErrorMessage } from "~/core/auth";
import type { SignInError } from "~/core/schema";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { AccountPage } from "./account-page";
import { useAccount } from "./account-store";
import { SignInPanel } from "./sign-in-panel";

/**
 * `/signin?error=<code>&return=<path>` (V2.md §1.1): where a sign-in that
 * didn't finish lands, with plain words and another try. Test mode's start
 * lands here too, without an error, to pick a test person.
 */
export function SignInPage({
  error,
  returnTo,
}: {
  error: SignInError | undefined;
  returnTo: string | undefined;
}) {
  const status = useAccount((s) => s.status);
  const signInOn = useAccount((s) => s.flags.signIn);
  const back = safeReturnPath(returnTo, "/");

  useEffect(() => {
    if (error) track("signin_failed", { reason: error });
  }, [error]);

  return (
    <AccountPage title="Sign in" busy={status === "loading"}>
      {error ? <p className="text-fg">{signInErrorMessage(error)}</p> : null}
      {status === "loading" ? (
        <Skeleton className="h-9 w-full" />
      ) : status === "signed-in" ? (
        <p className="text-muted">You're signed in.</p>
      ) : signInOn ? (
        <SignInPanel returnTo={back} from="signin-page" pitch={!error} />
      ) : error === "unavailable" ? null : (
        <p className="text-muted">{signInErrorMessage("unavailable")}</p>
      )}
      <p className="text-muted text-sm">
        If Google says your organization blocked Terpsicle, UMD's Google
        settings stopped it.
      </p>
      <WithTooltip label="Everything works without signing in">
        <a
          href={back}
          className="inline-flex text-fg underline-offset-4 hover:underline"
        >
          Back to Terpsicle
        </a>
      </WithTooltip>
    </AccountPage>
  );
}
