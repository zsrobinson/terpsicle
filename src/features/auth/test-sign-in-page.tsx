import { safeReturnPath } from "~/core/auth";
import { Skeleton } from "~/ui/skeleton";
import { AccountPage } from "./account-page";
import { useAccount } from "./account-store";
import { TestSignIn } from "./sign-in-panel";

/**
 * `/auth/test` (V2.md §4.6): where test mode's "Sign in (test mode)" lands.
 * Anywhere test mode is off (terpsicle.com, always), it's a dead end: the
 * Worker refuses test sign-ins there too.
 */
export function TestSignInPage({ returnTo }: { returnTo: string | undefined }) {
  const status = useAccount((s) => s.status);
  const testMode = useAccount((s) => s.flags.authTestMode);
  const back = safeReturnPath(returnTo, "/");
  return (
    <AccountPage title="Test sign-in" busy={status === "loading"}>
      {status === "loading" ? (
        <Skeleton className="h-9 w-full" />
      ) : testMode ? (
        <TestSignIn returnTo={back} />
      ) : (
        <p className="text-muted">
          Test sign-in is only on test copies of Terpsicle.
        </p>
      )}
      <a
        href={back}
        className="inline-flex text-fg underline-offset-4 hover:underline"
      >
        Back to Terpsicle
      </a>
    </AccountPage>
  );
}
