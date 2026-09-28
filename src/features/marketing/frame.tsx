import { Logo } from "~/components/brand/logo";
import { EarlyAccessChip } from "~/components/early-access";
import { SCHEDULE_PATH, STAY_PARAM } from "~/core/routing";
import { AccountButton } from "~/features/auth/account-button";
import { useAccount } from "~/features/auth/account-store";
import { ContactEmail } from "~/features/site/contact-email";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The marketing page's header and footer.

/**
 * Signed in, the header offers the way back in and the account, never "Sign
 * in" (a signed-in visitor took it to mean they'd been signed out). Until
 * /api/me answers, "Sign in" holds its place unseen, so it never flashes.
 */
export function MarketingHeader() {
  const status = useAccount((s) => s.status);
  return (
    <header className="mk-wrap flex h-14 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <WithTooltip label="About Terpsicle">
          {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
          <a href={`/?${STAY_PARAM}`} className="flex">
            <Logo />
          </a>
        </WithTooltip>
        <EarlyAccessChip />
      </div>
      <nav aria-label="Account" className="flex items-center gap-1">
        {status === "signed-in" ? (
          <>
            <WithTooltip label="Back to your schedule">
              <Button variant="ghost" size="sm" asChild>
                <a href={SCHEDULE_PATH}>Open Terpsicle</a>
              </Button>
            </WithTooltip>
            <AccountButton />
          </>
        ) : (
          <WithTooltip label="UMD accounts only: umd.edu or terpmail.umd.edu">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className={status === "loading" ? "invisible" : undefined}
            >
              <a href="/signin">Sign in</a>
            </Button>
          </WithTooltip>
        )}
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-hairline border-t py-4 text-muted text-sm">
      <div className="mk-wrap flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-fg">
          <Logo />
        </span>
        <WithTooltip label="What Terpsicle keeps about you, and why">
          <a href="/privacy" className="mk-link hover:text-fg">
            Privacy
          </a>
        </WithTooltip>
        <span>
          Course data from Testudo. Reviews and grades from{" "}
          <WithTooltip label="PlanetTerp, where the grade data and many reviews come from">
            <a href="https://planetterp.com" className="mk-link hover:text-fg">
              PlanetTerp
            </a>
          </WithTooltip>
          .
        </span>
        <span>Not affiliated with the University of Maryland.</span>
        <span className="inline-flex flex-wrap items-center gap-2">
          Contact: <ContactEmail />
        </span>
      </div>
    </footer>
  );
}
