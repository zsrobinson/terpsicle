import { type ReactNode, useEffect } from "react";
import { signInPagePath } from "~/core/auth/return-path";
import { useAccount } from "~/features/auth/account-store";
import { NotFoundPage } from "~/features/site/not-found-page";
import { Skeleton } from "~/ui/skeleton";

// The browser's half of "admins only" (V2 §4.8). The Worker already answers
// a page load with a 404 or a trip to /signin (src/server/auth/pages.ts);
// this covers the session ending while the page is open, and client-side
// navigation. The API refuses everyone else either way.

const leave = (path: string) => window.location.replace(path);

export function AdminGate({
  children,
  redirect = leave,
}: {
  children: ReactNode;
  /** Where a signed-out visitor goes; tests pass their own. */
  redirect?: (path: string) => void;
}) {
  const status = useAccount((s) => s.status);
  const isAdmin = useAccount((s) => s.user?.isAdmin === true);

  useEffect(() => {
    if (status !== "signed-out") return;
    const here = `${window.location.pathname}${window.location.search}`;
    redirect(signInPagePath(here));
  }, [status, redirect]);

  if (status === "signed-in" && isAdmin) return children;
  if (status === "signed-in") return <NotFoundPage />;
  return (
    <div
      className="mx-auto w-full max-w-[720px] space-y-3 px-4 pt-6"
      aria-busy="true"
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
