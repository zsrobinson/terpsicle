import { Mail } from "lucide-react";
import { Button } from "~/ui/button";
import type { WithTooltip } from "~/ui/tooltip";

// The public contact address, kept away from scrapers: it never appears
// whole in the HTML or the JS bundle. The page shows it in words, with
// "[at]", and "Email us" builds the mailto: link only when clicked.
// scripts/check-bundle.ts fails the build if the whole address shows up.

// Reversed so no minifier can fold the pieces back into the address.
const REVERSED_PARTS = ["nimda", "elcispret", "moc"] as const;

const unreverse = (s: string) => [...s].reverse().join("");

/** The address in words, with "[at]": readable, not one a scraper takes. */
export function contactEmailText(): string {
  const [user, domain, tld] = REVERSED_PARTS.map(unreverse);
  return `${user} [at] ${domain}.${tld}`;
}

/** The address itself, built at runtime only. */
export function contactEmailAddress(): string {
  const [user, domain, tld] = REVERSED_PARTS.map(unreverse);
  return [user, [domain, tld].join(".")].join(String.fromCharCode(64));
}

/**
 * The address in words, then an "Email us" button that opens a mailto:.
 * `Tooltip` is the kit's `WithTooltip`, or the marketing page's stand-in
 * that loads it on first use (so `/` doesn't carry it up front).
 */
export function ContactEmail({ Tooltip }: { Tooltip: typeof WithTooltip }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{contactEmailText()}</span>
      <Tooltip label="Open a new message in your email app">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.href = `mailto:${contactEmailAddress()}`;
          }}
        >
          <Mail aria-hidden="true" />
          Email us
        </Button>
      </Tooltip>
    </span>
  );
}
