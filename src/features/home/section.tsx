import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { track } from "~/lib/analytics";
import { viewWords } from "~/lib/cross-link";
import type { ProductId } from "~/lib/products";
import { OUTSIDE_TAB, OutsideArrow } from "~/ui/outside-link";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";

// One product's part of Home (docs/V3.md §1.5): the kit's `PageSection`,
// never a box, under the product's mark and a plain title, with the
// product's "View …" link at the right (or, for a product that lives on
// another site for now, a way out there). A part that loads keeps the
// height of its skeleton, so nothing under it moves when it fills in.

export function HomeSection({
  product,
  title,
  to,
  search,
  params,
  tooltip,
  tag,
  meta,
  outside,
  children,
}: {
  product: ProductId;
  title: string;
  /** After the title: the term's tag, as everywhere a term is named. */
  tag?: ReactNode;
  /** Muted facts after the title: "5 of 9 done". */
  meta?: ReactNode;
  /** Where "View …" goes. */
  to: LinkProps["to"];
  search?: LinkProps["search"];
  params?: LinkProps["params"];
  /** The link's tooltip, when its words alone don't say where it goes. */
  tooltip: string;
  /** Another site in place of the product's page: its address and words. */
  outside?: { href: string; label: string };
  children: ReactNode;
}) {
  const linkClass =
    // inline-block: its baseline is its text's, so it sits on the title's
    // line while its padding makes a 44px target on phones.
    "inline-block whitespace-nowrap font-medium text-muted text-sm transition-colors hover:text-fg max-md:-my-3 max-md:py-3";
  return (
    <PageSection
      title={
        // Inline, not flex: the heading's baseline stays its words', so the
        // link beside it lines up with them rather than the mark's edge.
        <span>
          <IntegrationLabel product={product}>{title}</IntegrationLabel>
          {tag}
          {meta ? <span className="emph-meta ml-2">{meta}</span> : null}
        </span>
      }
      aside={
        <WithTooltip label={tooltip}>
          {outside ? (
            <a href={outside.href} {...OUTSIDE_TAB} className={linkClass}>
              {outside.label}
              <OutsideArrow className="ml-0.5 inline align-[-1px]" />
            </a>
          ) : (
            <Link
              to={to}
              search={search}
              params={params}
              onClick={() => homeLinkClicked(product)}
              className={linkClass}
            >
              {viewWords(product)}
              <ArrowRight
                size={13}
                aria-hidden="true"
                className="ml-1 inline align-[-2px]"
              />
            </Link>
          )}
        </WithTooltip>
      }
    >
      {children}
    </PageSection>
  );
}

/** Which of Home's links into a product get followed: the product only. */
export function homeLinkClicked(to: ProductId): void {
  track("home_link_clicked", { to });
}

/** Rows loading, at the height the rows will have. */
export function HomeSkeleton({ rows, label }: { rows: number; label: string }) {
  return <RowSkeleton rows={rows} inset={false} label={label} />;
}

/** One quiet line where a part has nothing to list ("No more classes today"). */
export function HomeNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("emph-secondary py-2 text-sm", className)}>{children}</p>
  );
}

/** A row's one link, answering for the whole row (which is `relative`). */
export const ROW_LINK = "after:absolute after:inset-0";
