import type { ReactNode } from "react";
import { GoogleButton } from "~/features/auth/sign-in-panel";

/** Why to sign in, then the Google (or test mode) button, in place. */
export function SignInPrompt({ children }: { children: ReactNode }) {
  const here =
    typeof window === "undefined"
      ? "/reviews"
      : `${window.location.pathname}${window.location.search}`;
  return (
    <div className="mt-2 max-w-[360px] space-y-3 border border-hairline-strong p-3">
      <p className="text-muted">{children}</p>
      <GoogleButton returnTo={here} from="reviews" />
    </div>
  );
}
