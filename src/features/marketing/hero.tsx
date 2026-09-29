import { cn } from "cn";
import { SCHEDULE_PATH } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { Button } from "~/ui/button";
import { HERO } from "./copy";
import { LazyTooltip } from "./lazy-tooltip";
import { Misprint } from "./misprint";
import { PAINT } from "./products";

// The hero's words: the headline, what Terpsicle is, and the way in. The
// picture beside it is the story's screen at its first stage, the plain
// week (story.tsx). Signed in, it never asks for a sign-in again (the owner:
// a signed-in roommate read "Sign in" as "signed out"); until /api/me
// answers, the sign-in link holds its place unseen, so it never flashes.

export function HeroWords() {
  const status = useAccount((s) => s.status);
  const signedIn = status === "signed-in";
  return (
    <div className="flex flex-col gap-6">
      <h1 id="hero-title" className="mk-display mk-h1">
        <Misprint className={PAINT.schedule.text}>{HERO.title}</Misprint>
      </h1>
      <p className="mk-lead">{HERO.lead}</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <LazyTooltip label="No account needed">
            <Button asChild className="mk-cta">
              <a href={SCHEDULE_PATH}>View schedule</a>
            </Button>
          </LazyTooltip>
          {signedIn ? null : (
            <LazyTooltip label="UMD accounts only: umd.edu or terpmail.umd.edu">
              <a
                href="/signin"
                className={cn(
                  "mk-link font-semibold text-base",
                  status === "loading" && "invisible",
                )}
              >
                Sign in with UMD
              </a>
            </LazyTooltip>
          )}
        </div>
        <p
          className={cn(
            "text-muted text-sm",
            status === "loading" && "invisible",
          )}
        >
          {signedIn ? HERO.noteSignedIn : HERO.note}
        </p>
      </div>
    </div>
  );
}
