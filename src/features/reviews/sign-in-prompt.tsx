import type { ReactNode } from "react";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { Card } from "~/ui/card";

/**
 * Why to sign in, then the Google (or test mode) button, in place: a `Card`,
 * since it's one thing that opens where you asked (under a review, in a
 * row) and one thing you press.
 */
export function SignInPrompt({ children }: { children: ReactNode }) {
  const here =
    typeof window === "undefined"
      ? "/reviews"
      : `${window.location.pathname}${window.location.search}`;
  return (
    <Card className="max-w-sm gap-3">
      <p className="text-muted">{children}</p>
      <GoogleButton returnTo={here} from="reviews" />
    </Card>
  );
}
