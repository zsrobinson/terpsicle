import { lazy, Suspense, useEffect } from "react";
import { useAccount } from "~/features/auth/account-store";
import { askForPush, usePushAsk } from "./push-ask";

// Mounted once for every page, beside the install prompt's host
// (src/app/pwa-client.tsx): shows the iPhone sheet when a moment asks with
// it, and on the Home Screen app's first launch (once signed in there: the
// Home Screen app keeps its own sign-in) asks with the Turn on step. The
// sheet's code loads only then.

const PushAskSheet = lazy(() =>
  import("./push-ask-sheet").then((m) => ({ default: m.PushAskSheet })),
);

export function PushAskHost() {
  const sheet = usePushAsk((s) => s.sheet);
  const signedIn = useAccount((s) => s.status === "signed-in");
  useEffect(() => {
    if (signedIn) void askForPush("home-screen");
  }, [signedIn]);
  if (sheet === null) return null;
  return (
    <Suspense fallback={null}>
      <PushAskSheet moment={sheet.moment} kind={sheet.kind} />
    </Suspense>
  );
}
