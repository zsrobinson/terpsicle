import { Logo } from "~/components/brand/logo";
import { EarlyAccessChip } from "~/components/early-access";
import { LazyTooltip } from "~/components/lazy-tooltip";
import { SCHEDULE_PATH, STAY_PARAM } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { ContactEmail } from "~/features/site/contact-email";
import { lazyComponent } from "~/lib/lazy-component";
import { Button } from "~/ui/button";

// The marketing page's header and footer.

// Only a signed-in visitor at `/?stay` sees the account menu, so its code
// (the menu, the avatar, sync's status) loads when they do, not with the
// page (scripts/check-bundle.ts). "Sign in" holds the place, unseen, while
// it comes, so the way back in and the avatar arrive together; if it doesn't
// arrive, "Open Terpsicle" stands alone until it does (~/lib/lazy-component),
// never an error.
const SignedIn = lazyComponent<object>(
  () =>
    import("~/features/auth/account-button").then(
      ({ AccountButton }) =>
        function SignedInWithMenu() {
          return (
            <>
              <OpenTerpsicle />
              <AccountButton />
            </>
          );
        },
    ),
  OpenTerpsicle,
  { Loading: () => <SignInLink hidden /> },
);

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
        <LazyTooltip label="About Terpsicle">
          {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
          <a href={`/?${STAY_PARAM}`} className="flex">
            <Logo />
          </a>
        </LazyTooltip>
        <EarlyAccessChip Tooltip={LazyTooltip} />
      </div>
      <nav aria-label="Account" className="flex items-center gap-1">
        {status === "signed-in" ? (
          <SignedIn />
        ) : (
          <SignInLink hidden={status === "loading"} />
        )}
      </nav>
    </header>
  );
}

function OpenTerpsicle() {
  return (
    <LazyTooltip label="Back to your schedule">
      <Button variant="ghost" size="sm" asChild>
        <a href={SCHEDULE_PATH}>Open Terpsicle</a>
      </Button>
    </LazyTooltip>
  );
}

function SignInLink({ hidden }: { hidden: boolean }) {
  return (
    <LazyTooltip label="UMD accounts only: umd.edu or terpmail.umd.edu">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className={hidden ? "invisible" : undefined}
      >
        <a href="/signin">Sign in</a>
      </Button>
    </LazyTooltip>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-hairline border-t py-4 text-muted text-sm">
      <div className="mk-wrap flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-fg">
          <Logo />
        </span>
        <LazyTooltip label="What Terpsicle keeps about you, and why">
          <a href="/privacy" className="mk-link hover:text-fg">
            Privacy
          </a>
        </LazyTooltip>
        <span>
          Course data from Testudo. Reviews and grades from{" "}
          <LazyTooltip label="PlanetTerp, where the grade data and many reviews come from">
            <a href="https://planetterp.com" className="mk-link hover:text-fg">
              PlanetTerp
            </a>
          </LazyTooltip>
          .
        </span>
        <span>Not affiliated with the University of Maryland.</span>
        <span className="inline-flex flex-wrap items-center gap-2">
          Contact: <ContactEmail Tooltip={LazyTooltip} />
        </span>
      </div>
    </footer>
  );
}
