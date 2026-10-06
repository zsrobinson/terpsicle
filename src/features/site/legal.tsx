import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { OutsideLink } from "~/ui/outside-link";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";

// The pieces `/privacy` and `/terms` share: a section of prose, links in
// it, and the date both pages were last changed. Both are reading pages
// on the kit (docs/COHESION.md), in plain words (docs/decisions.md,
// "Privacy and terms in plain words; open source is the proof").

/** When either page last changed in substance. Change it with the words. */
export const LEGAL_UPDATED = "October 6, 2026";

/** Where the code lives: how people check what the pages claim. */
export const REPO_URL = "https://github.com/zsrobinson/terpsicle";

/** A link inside a paragraph: underlined, in the paragraph's ink. */
export const PROSE_LINK =
  "text-fg underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-fg";

/** One part of a page: the kit's section, with prose in it. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <PageSection title={title} className="text-fg">
      <div className="flex flex-col gap-3 text-muted leading-relaxed">
        {children}
      </div>
    </PageSection>
  );
}

/** A link to another of our pages, inside a paragraph. */
export function ProseLink({
  to,
  tooltip,
  children,
}: {
  to: "/privacy" | "/terms" | "/settings";
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <WithTooltip label={tooltip}>
      <Link to={to} className={PROSE_LINK}>
        {children}
      </Link>
    </WithTooltip>
  );
}

/** A link to another site, inside a paragraph: a new tab, with the arrow. */
export function ProseOutsideLink({
  href,
  tooltip,
  children,
}: {
  href: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <WithTooltip label={tooltip}>
      <OutsideLink href={href} className={PROSE_LINK}>
        {children}
      </OutsideLink>
    </WithTooltip>
  );
}

/** "Name: what it does" lines: who else touches data, and similar. */
export function NamedList({
  items,
}: {
  items: readonly { name: string; children: ReactNode }[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.name}>
          <span className="font-medium text-fg">{item.name}</span>:{" "}
          {item.children}
        </li>
      ))}
    </ul>
  );
}
